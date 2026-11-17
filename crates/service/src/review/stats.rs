//! Neutral stats (spec 2026-11-16, *Service and IPC*): focus over a range, the weekly goal,
//! tasks, routines, habits and the estimate line, every sentence worded in [`super::words`].
//!
//! [`stats_parts`] reads the rows for any (from, to) date range, so the weekly look-back reads
//! the week it looks back on with the same code. Nothing here scores, compares or recaps.

use std::collections::{BTreeMap, BTreeSet};

use orasenda_core::review::{Bucket, StatsRange as CoreRange, days_done, focus_buckets};
use orasenda_core::{LocalDate, Weekdays};
use orasenda_store::routines::habit_checks;
use orasenda_store::routines::habits::{self, HabitRow};
use orasenda_store::routines::routine_runs;
use orasenda_store::routines::{self as routine_rows};
use orasenda_store::{StoreError, Txn, focus_sessions, tasks};

use super::{buffer, words};
use crate::api::{BarView, GoalView, HabitStat, ReviewError, StatsRange, StatsView};
use crate::routines::dot_views;
use crate::scheduler::Host;
use crate::session::{SessionService, lock};

const DAY_MS: i64 = 86_400_000;
const MINUTE_MS: i64 = 60_000;

/// A focus-phase session, by the local day it started on.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct FocusDay {
    pub date: LocalDate,
    pub focused_ms: u64,
}

/// A Done task finished in the range.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DoneTask {
    pub id: String,
    pub title: String,
    pub done: LocalDate,
}

/// A live habit with the days it was checked in (every check-in from 27 days before the
/// range's end, so the dot grid has its window).
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HabitDays {
    pub name: String,
    pub created: LocalDate,
    pub days: Weekdays,
    pub done: BTreeSet<LocalDate>,
}

/// What a date range holds, before any wording.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Parts {
    /// Focus-phase sessions that started in the range, in start order.
    pub sessions: Vec<FocusDay>,
    /// Done tasks whose `done_at` falls in the range, newest first.
    pub done_tasks: Vec<DoneTask>,
    /// Of those, the ones with an estimate and a counted session: (done, planned, counted).
    pub estimated: Vec<(LocalDate, u8, u32)>,
    /// Each live routine and how many runs finished in the range.
    pub routines: Vec<(String, u32)>,
    pub habits: Vec<HabitDays>,
}

/// `date` moved by `days` (negative goes back).
pub(super) fn shift(date: LocalDate, days: i32) -> LocalDate {
    let step = |from: LocalDate| if days < 0 { from.pred() } else { from.succ() };
    (0..days.unsigned_abs()).fold(date, |acc, _| step(acc))
}

/// The epoch millisecond local midnight starts `date`, for a zone `offset_min` east of UTC.
pub(super) fn local_start_ms(date: LocalDate, offset_min: i32) -> u64 {
    let ms = date.days_since_epoch() * DAY_MS - i64::from(offset_min) * MINUTE_MS;
    u64::try_from(ms).unwrap_or(0)
}

/// Reads what `from..=to` (local dates) holds, at the given offset. The look-back calls this
/// for last week's Monday to Sunday.
pub(crate) fn stats_parts(
    txn: &Txn,
    from: LocalDate,
    to: LocalDate,
    offset_min: i32,
) -> Result<Parts, StoreError> {
    let from_ms = local_start_ms(from, offset_min);
    let to_ms = local_start_ms(to.succ(), offset_min);
    let sessions = focus_sessions::started_between(txn, from_ms, to_ms)?
        .into_iter()
        .filter(|row| row.phase == "focus")
        .map(|row| FocusDay {
            date: LocalDate::from_epoch_ms(row.started_ms, offset_min),
            focused_ms: row.focused_ms,
        })
        .collect();
    let done: Vec<_> = tasks::list_done_since(txn, from_ms)?
        .into_iter()
        .filter(|task| task.done_at.is_some_and(|at| at < to_ms))
        .collect();
    let estimated = buffer::estimated_with_counts(txn, &done, offset_min)?;
    let done_tasks = done
        .iter()
        .filter_map(|task| {
            let at = task.done_at?;
            Some(DoneTask {
                id: task.id.clone(),
                title: task.title.clone(),
                done: LocalDate::from_epoch_ms(at, offset_min),
            })
        })
        .collect();
    Ok(Parts {
        sessions,
        done_tasks,
        estimated,
        routines: finished_runs(txn, from, to, offset_min)?,
        habits: habit_days(txn, from, to, offset_min)?,
    })
}

/// Each live routine with how many of its runs finished in `from..=to`. A removed routine is
/// left out, and so are its runs, and so is one created after `to`.
fn finished_runs(
    txn: &Txn,
    from: LocalDate,
    to: LocalDate,
    offset_min: i32,
) -> Result<Vec<(String, u32)>, StoreError> {
    let runs = routine_runs::finished_between(txn, &from.to_iso(), &to.to_iso())?;
    let mut count: BTreeMap<&str, u32> = BTreeMap::new();
    for run in &runs {
        *count.entry(run.routine_id.as_str()).or_default() += 1;
    }
    Ok(routine_rows::list_live(txn)?
        .into_iter()
        .filter(|routine| LocalDate::from_epoch_ms(routine.created_at, offset_min) <= to)
        .map(|routine| {
            let n = count.get(routine.id.as_str()).copied().unwrap_or(0);
            (routine.fields.name, n)
        })
        .collect())
}

/// The live habits, standalone first, each with its check-in days.
fn habit_days(
    txn: &Txn,
    from: LocalDate,
    to: LocalDate,
    offset_min: i32,
) -> Result<Vec<HabitDays>, StoreError> {
    let rows = habits::list_all_live(txn)?;
    let routine_days: BTreeMap<String, u8> = routine_rows::list_live(txn)?
        .into_iter()
        .map(|routine| (routine.id, routine.fields.days))
        .collect();
    let ids: Vec<String> = rows.iter().map(|habit| habit.id.clone()).collect();
    // The dot grid reaches 27 days before the range's end.
    let since = from.min(shift(to, -27));
    let mut checked: BTreeMap<String, BTreeSet<LocalDate>> = BTreeMap::new();
    for check in habit_checks::checks_since(txn, &ids, &since.to_iso())? {
        let day = LocalDate::parse_iso(&check.day).ok_or_else(|| bad("a check-in day"))?;
        checked.entry(check.habit_id).or_default().insert(day);
    }
    rows.into_iter()
        .filter(|habit| LocalDate::from_epoch_ms(habit.created_at, offset_min) <= to)
        .map(|habit| {
            let bits = habit_mask(&habit, &routine_days);
            Ok(HabitDays {
                created: LocalDate::from_epoch_ms(habit.created_at, offset_min),
                days: Weekdays::from_bits(bits).ok_or_else(|| bad("a day mask"))?,
                done: checked.remove(&habit.id).unwrap_or_default(),
                name: habit.fields.name,
            })
        })
        .collect()
}

/// A standalone habit's own days; a routine's habit follows its routine.
fn habit_mask(habit: &HabitRow, routine_days: &BTreeMap<String, u8>) -> u8 {
    let every_day = Weekdays::EVERY_DAY.bits();
    match &habit.routine_id {
        None => habit.fields.days.unwrap_or(every_day),
        Some(id) => routine_days.get(id).copied().unwrap_or(every_day),
    }
}

impl SessionService {
    /// The stats view for `range` at `now_ms`, read in one transaction.
    pub(crate) fn review_stats(
        &self,
        now_ms: u64,
        range: StatsRange,
    ) -> Result<StatsView, StoreError> {
        let store = self
            .store()
            .ok_or_else(|| StoreError::Sqlite("the store is unavailable".into()))?;
        let local = self.routines_local(now_ms);
        let settings = self.settings();
        let core: CoreRange = range.into();
        let buckets = focus_buckets(&[], core, local.today);
        let from = buckets.first().map_or(local.today, |bucket| bucket.start);
        store.read(|txn| {
            let parts = stats_parts(txn, from, local.today, local.offset_min)?;
            let ever = focus_sessions::counts(txn)?.1 > 0;
            let buffer = buffer::suggestion(
                txn,
                local.today,
                local.offset_min,
                now_ms,
                settings.board_estimate_buffer,
            )?;
            let goal_minutes = u32::from(settings.review_focus_goal_hours) * 60;
            Ok(build(
                &Build {
                    range,
                    today: local.today,
                    goal_minutes,
                    ever,
                },
                &parts,
                buffer,
            ))
        })
    }
}

/// What the view is built for.
struct Build {
    range: StatsRange,
    today: LocalDate,
    goal_minutes: u32,
    /// Any focus session was ever recorded.
    ever: bool,
}

fn build(
    ask: &Build,
    parts: &Parts,
    buffer: Option<crate::api::BufferSuggestionView>,
) -> StatsView {
    let core: CoreRange = ask.range.into();
    let spans: Vec<(LocalDate, u64)> = parts
        .sessions
        .iter()
        .map(|s| (s.date, s.focused_ms))
        .collect();
    let buckets = focus_buckets(&spans, core, ask.today);
    let minutes: u32 = buckets.iter().map(|bucket| bucket.minutes).sum();
    let sessions = u32::try_from(parts.sessions.len()).unwrap_or(u32::MAX);
    let from = buckets.first().map_or(ask.today, |bucket| bucket.start);
    let empty = (minutes == 0).then(|| words::empty_line(!ask.ever));
    let summary = match empty {
        Some(line) => vec![line.to_owned()],
        None => vec![
            words::focus_line(minutes, sessions),
            words::tasks_line(u32::try_from(parts.done_tasks.len()).unwrap_or(u32::MAX)),
        ],
    };
    StatsView {
        range: ask.range,
        summary,
        bars: buckets.iter().map(|bucket| bar(core, bucket)).collect(),
        goal: goal(ask, &buckets),
        routines: parts
            .routines
            .iter()
            .map(|(name, finished)| words::routine_line(name, *finished))
            .collect(),
        habits: parts
            .habits
            .iter()
            .map(|habit| habit_stat(ask, habit, from))
            .collect(),
        estimate_line: estimate_line(&parts.estimated),
        buffer,
        empty: empty.map(str::to_owned),
    }
}

fn bar(range: CoreRange, bucket: &Bucket) -> BarView {
    BarView {
        label: words::bar_label(range, bucket.start, bucket.current),
        spoken: words::bar_spoken(range, bucket.start, bucket.minutes),
        minutes: bucket.minutes,
        duration: if bucket.minutes == 0 {
            String::new()
        } else {
            words::duration(bucket.minutes)
        },
        current: bucket.current,
        empty: bucket.minutes == 0 || bucket.future,
    }
}

/// The weekly goal: the week's total on Week, a tick per week (its line is about this week)
/// on 8 weeks, none on 6 months and with no goal set.
fn goal(ask: &Build, buckets: &[Bucket]) -> Option<GoalView> {
    let goal = ask.goal_minutes;
    let shown = match ask.range {
        StatsRange::Week => buckets.iter().map(|bucket| bucket.minutes).sum(),
        StatsRange::Weeks8 => buckets
            .iter()
            .find(|bucket| bucket.current)
            .map_or(0, |bucket| bucket.minutes),
        StatsRange::Months6 => return None,
    };
    // A tick is the goal itself, so its words never say "reached".
    let reached_for_words = if ask.range == StatsRange::Week {
        shown
    } else {
        0
    };
    Some(GoalView {
        minutes: goal,
        words: words::goal_words(reached_for_words, goal)?,
        line: words::goal_line(shown, goal)?,
    })
}

fn habit_stat(ask: &Build, habit: &HabitDays, from: LocalDate) -> HabitStat {
    let done: Vec<LocalDate> = habit.done.iter().copied().collect();
    let (days, since) = days_done(habit.created, from, ask.today, &done);
    HabitStat {
        name: habit.name.clone(),
        line: words::habit_line(days, since, ask.range.into()),
        dots: (ask.range == StatsRange::Week)
            .then(|| dot_views(habit.created, ask.today, habit.days, &habit.done)),
    }
}

/// G1: finished tasks in the range with an estimate and a counted session.
pub(super) fn estimate_line(estimated: &[(LocalDate, u8, u32)]) -> Option<String> {
    let tasks = u32::try_from(estimated.len()).unwrap_or(u32::MAX);
    let planned = estimated.iter().map(|(_, n, _)| u32::from(*n)).sum();
    let actual = estimated.iter().map(|(_, _, n)| *n).sum();
    words::estimate_line(tasks, planned, actual)
}

fn bad(what: &str) -> StoreError {
    StoreError::Sqlite(format!("{what} is out of range"))
}

/// `review_stats`: the neutral stats for `range`. A store that can't be read is an error,
/// never an empty view.
pub fn run_review_stats<H: Host>(host: &H, range: StatsRange) -> Result<StatsView, ReviewError> {
    let service = host.service().ok_or(ReviewError::Store)?;
    lock(service)
        .review_stats(host.now_ms(), range)
        .map_err(|error| {
            eprintln!("review: could not read the stats ({error})");
            ReviewError::Store
        })
}
