//! `weekly_save` and `weekly_complete`: the weekly review's writes. Both name the week they
//! are for, check it, resolve the typed priorities and save the reflection in one transaction.
//!
//! A typed title becomes a Backlog task in that same transaction, and the returned view holds
//! its id, so the webview's next save sends `{ task: id }` and never creates it twice.

use orasenda_core::LocalDate;
use orasenda_core::review::week_start;
use orasenda_store::reflections::{self, ReflectionKind, ReflectionWrite};
use orasenda_store::tasks;
use orasenda_store::{StoreError, Txn};

use crate::api::{PriorityPick, ReviewError, WeeklyDraft, WeeklyView};
use crate::board::{append_backlog, check};
use crate::review::{changed_view, check_period, emit_changed};
use crate::scheduler::Host;
use crate::session::lock;

/// The longest improvement, in characters.
const MAX_IMPROVEMENT: usize = 200;
/// The longest notes, in characters.
const MAX_NOTES: usize = 2_000;
/// The most priorities in a week.
const MAX_PRIORITIES: usize = 3;

/// `weekly_save`: saves the draft for the week starting `week_start`; the review stays open.
pub fn run_weekly_save<H: Host>(
    host: &H,
    week_start: String,
    draft: WeeklyDraft,
) -> Result<WeeklyView, ReviewError> {
    save(host, &week_start, draft, false)
}

/// `weekly_complete`: saves the draft and marks the week planned. Completing again keeps the
/// first completion time.
pub fn run_weekly_complete<H: Host>(
    host: &H,
    week_start: String,
    draft: WeeklyDraft,
) -> Result<WeeklyView, ReviewError> {
    save(host, &week_start, draft, true)
}

/// A draft with its text trimmed and checked and its picks made distinct.
struct Checked {
    improvement: Option<String>,
    notes: Option<String>,
    picks: Vec<PriorityPick>,
}

fn save<H: Host>(
    host: &H,
    given: &str,
    draft: WeeklyDraft,
    complete: bool,
) -> Result<WeeklyView, ReviewError> {
    let checked = check_draft(draft)?;
    let service = host.service().ok_or(ReviewError::Store)?;
    let now_ms = host.now_ms();
    let (view, review, board) = {
        let guard = lock(service);
        let local = guard.routines_local(now_ms);
        check_period(ReflectionKind::Week, given, now_ms, local.offset_min)?;
        let week = LocalDate::parse_iso(given).ok_or(ReviewError::Period)?;
        let store = guard.store().ok_or(ReviewError::Store)?;
        let created = store
            .write(now_ms, |txn| write(txn, given, &checked, complete))
            .map_err(|error| {
                eprintln!("review: could not save the weekly review ({error})");
                ReviewError::Store
            })??;
        let view = guard.weekly_view_of(now_ms, week)?;
        // The flag follows the week `today` falls in; a new task is a new card either way.
        let board = (created || week == week_start(local.today))
            .then(|| guard.board_changed(now_ms))
            .flatten();
        (view, changed_view(&guard, now_ms), board)
    };
    if let Some(review) = &review {
        emit_changed(host, review);
    }
    if let Some((seq, board)) = &board {
        host.emit_board_changed(*seq, board);
    }
    Ok(view)
}

/// Trims and checks the text, and keeps each pick once. More than three distinct picks is
/// `Full`; a blank typed title is `Empty`; one over the task title limit is `TooLong`.
fn check_draft(draft: WeeklyDraft) -> Result<Checked, ReviewError> {
    let mut picks: Vec<PriorityPick> = Vec::new();
    for pick in draft.priorities {
        let pick = match pick {
            PriorityPick::Task(id) => PriorityPick::Task(id),
            PriorityPick::NewTitle(text) => {
                PriorityPick::NewTitle(check::title(&text).map_err(|error| match error {
                    crate::api::BoardError::TitleEmpty => ReviewError::Empty,
                    crate::api::BoardError::TitleTooLong => ReviewError::TooLong,
                    _ => ReviewError::Store,
                })?)
            }
        };
        if !picks.contains(&pick) {
            picks.push(pick);
        }
    }
    if picks.len() > MAX_PRIORITIES {
        return Err(ReviewError::Full);
    }
    Ok(Checked {
        improvement: text(draft.improvement, MAX_IMPROVEMENT)?,
        notes: text(draft.notes, MAX_NOTES)?,
        picks,
    })
}

/// Trimmed text, or `None` for an absent or blank one; `TooLong` over `max` characters.
fn text(value: Option<String>, max: usize) -> Result<Option<String>, ReviewError> {
    let Some(value) = value else {
        return Ok(None);
    };
    let value = value.trim();
    if value.chars().count() > max {
        Err(ReviewError::TooLong)
    } else if value.is_empty() {
        Ok(None)
    } else {
        Ok(Some(value.to_owned()))
    }
}

/// Resolves the picks and saves the reflection. Every picked task is looked up before any new
/// one is created, so a refusal writes nothing. Returns whether a task was created.
fn write(
    txn: &mut Txn,
    week: &str,
    checked: &Checked,
    complete: bool,
) -> Result<Result<bool, ReviewError>, StoreError> {
    for pick in &checked.picks {
        if let PriorityPick::Task(id) = pick
            && tasks::get(txn, id)?.is_none_or(|task| task.deleted_at.is_some())
        {
            return Ok(Err(ReviewError::NotFound));
        }
    }
    let mut ids = Vec::new();
    let mut created = false;
    for pick in &checked.picks {
        match pick {
            PriorityPick::Task(id) => ids.push(id.clone()),
            PriorityPick::NewTitle(title) => {
                ids.push(append_backlog(txn, title.clone())?);
                created = true;
            }
        }
    }
    reflections::upsert(
        txn,
        &ReflectionWrite {
            kind: ReflectionKind::Week,
            period: week.to_owned(),
            went_well: None,
            to_improve: None,
            outside_control: None,
            improvement: checked.improvement.clone(),
            notes: checked.notes.clone(),
            priorities: ids,
            complete,
        },
    )?;
    Ok(Ok(created))
}
