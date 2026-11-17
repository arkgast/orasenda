//! The guided shutdown: the view frozen at the shutdown day, and its save.

use orasenda_core::LocalDate;
use orasenda_core::review::shutdown_day;
use orasenda_store::reflections::{self, ReflectionKind, ReflectionWrite, reflection_id};
use orasenda_store::tasks::{self, Lane as Stored};
use orasenda_store::{StoreError, Txn};

use super::{changed_view, check_period, emit_changed, words};
use crate::api::{ReviewError, ShutdownAnswers, ShutdownView, UnfinishedTask};
use crate::board::columns;
use crate::scheduler::Host;
use crate::session::{SessionService, lock};

/// A shutdown answer's longest length, in characters.
const MAX_ANSWER: usize = 1_000;

/// `shutdown_get`: the shutdown for the current shutdown day.
pub fn run_shutdown_get<H: Host>(host: &H) -> Result<ShutdownView, ReviewError> {
    let service = host.service().ok_or(ReviewError::Store)?;
    let now_ms = host.now_ms();
    let guard = lock(service);
    let day = shutdown_day(now_ms, guard.routines_local(now_ms).offset_min);
    guard.shutdown_view(now_ms, day)
}

/// `shutdown_complete`: saves the answers for `day` (the current shutdown day or the one just
/// before) and marks the shutdown complete. A later call overwrites the answers and keeps the
/// first completion time. Answers are trimmed; blank or absent is stored as NULL.
pub fn run_shutdown_complete<H: Host>(
    host: &H,
    day: &str,
    answers: ShutdownAnswers,
) -> Result<ShutdownView, ReviewError> {
    let service = host.service().ok_or(ReviewError::Store)?;
    let now_ms = host.now_ms();
    let (view, changed) = {
        let guard = lock(service);
        let offset_min = guard.routines_local(now_ms).offset_min;
        check_period(ReflectionKind::Shutdown, day, now_ms, offset_min)?;
        let write = ReflectionWrite {
            kind: ReflectionKind::Shutdown,
            period: day.to_owned(),
            went_well: answer(answers.went_well)?,
            to_improve: answer(answers.to_improve)?,
            outside_control: answer(answers.outside_control)?,
            improvement: None,
            notes: None,
            priorities: Vec::new(),
            complete: true,
        };
        let store = guard.store().ok_or(ReviewError::Store)?;
        store
            .write(now_ms, |txn| reflections::upsert(txn, &write))
            .map_err(|error| {
                eprintln!("review: could not save the shutdown ({error})");
                ReviewError::Store
            })?;
        // `check_period` accepted the day, so it is the shutdown day or the one before.
        let current = shutdown_day(now_ms, offset_min);
        let frozen = if day == current.to_iso() {
            current
        } else {
            current.pred()
        };
        // The save stands even when the read-back fails.
        (
            guard.shutdown_view(now_ms, frozen),
            changed_view(&guard, now_ms),
        )
    };
    if let Some(review) = changed {
        emit_changed(host, &review);
    }
    view
}

/// Trims; blank is `None`; over the limit is `TooLong`.
fn answer(text: Option<String>) -> Result<Option<String>, ReviewError> {
    let Some(text) = text else { return Ok(None) };
    let text = text.trim();
    if text.chars().count() > MAX_ANSWER {
        return Err(ReviewError::TooLong);
    }
    Ok((!text.is_empty()).then(|| text.to_owned()))
}

impl SessionService {
    /// The shutdown of `day`. Unavailable or unreadable storage answers `Store`.
    pub(crate) fn shutdown_view(
        &self,
        now_ms: u64,
        day: LocalDate,
    ) -> Result<ShutdownView, ReviewError> {
        let store = self.store().ok_or(ReviewError::Store)?;
        let running = self.running_task();
        let (unfinished, row) = store.read(|txn| read(txn, day, running)).map_err(|error| {
            eprintln!("review: could not read the shutdown ({error})");
            ReviewError::Store
        })?;
        let tomorrow = self.tomorrow_lines(now_ms, day).map_err(|error| {
            eprintln!("review: could not read tomorrow ({error})");
            ReviewError::Store
        })?;
        let answers = row.as_ref().map(|row| ShutdownAnswers {
            went_well: row.went_well.clone(),
            to_improve: row.to_improve.clone(),
            outside_control: row.outside_control.clone(),
        });
        Ok(ShutdownView {
            day: day.to_iso(),
            day_label: words::day_label(day),
            unfinished,
            tomorrow,
            answers: answers.unwrap_or_default(),
            completed_line: row
                .is_some_and(|row| row.completed_at.is_some())
                .then(|| words::completed_line(false).to_owned()),
        })
    }
}

type Read = (Vec<UnfinishedTask>, Option<reflections::ReflectionRow>);

fn read(txn: &Txn, day: LocalDate, running: Option<&str>) -> Result<Read, StoreError> {
    let names = columns::read(txn)?;
    let live = tasks::list_live(txn)?;
    let mut unfinished = Vec::new();
    for lane in [Stored::Today, Stored::Doing] {
        let lane_id = crate::board::view::lane(lane);
        let label = names
            .iter()
            .find(|column| column.lane == lane_id)
            .map_or("", |column| column.name.as_str());
        for task in live.iter().filter(|task| task.lane == lane) {
            unfinished.push(UnfinishedTask {
                id: task.id.clone(),
                title: task.title.clone(),
                lane_label: label.to_owned(),
                active: running == Some(task.id.as_str()),
            });
        }
    }
    let row = reflections::get(txn, &reflection_id(ReflectionKind::Shutdown, &day.to_iso()))?
        .filter(|row| row.deleted_at.is_none());
    Ok((unfinished, row))
}
