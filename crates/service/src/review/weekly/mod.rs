//! The weekly review's view: the look-back on the week before the planned one, what the
//! person has answered so far, and last week's improvement shown back as written.

mod look_back;
mod save;

use orasenda_core::LocalDate;
use orasenda_core::review::{look_back as look_back_range, planned_week};
use orasenda_store::reflections::{self, ReflectionKind, ReflectionRow, reflection_id};
use orasenda_store::{StoreError, Txn};

use super::view::{live, priorities};
use super::words;
use crate::api::{ReviewError, WeeklyAnswers, WeeklyView};
use crate::scheduler::Host;
use crate::session::{SessionService, lock};

pub use save::{run_weekly_complete, run_weekly_save};

/// `weekly_get`: the weekly review now. Unavailable or unreadable storage answers `Store`.
pub fn run_weekly_get<H: Host>(host: &H) -> Result<WeeklyView, ReviewError> {
    let service = host.service().ok_or(ReviewError::Store)?;
    lock(service).weekly_view(host.now_ms())
}

impl SessionService {
    /// The weekly view at `now_ms`, read in one transaction.
    pub(crate) fn weekly_view(&self, now_ms: u64) -> Result<WeeklyView, ReviewError> {
        let planned = planned_week(self.routines_local(now_ms).today);
        self.weekly_view_of(now_ms, planned)
    }

    /// The weekly view of the week starting `planned` (the planned week, or the one before it
    /// for a flow left open across midnight).
    pub(crate) fn weekly_view_of(
        &self,
        now_ms: u64,
        planned: LocalDate,
    ) -> Result<WeeklyView, ReviewError> {
        let store = self.store().ok_or(ReviewError::Store)?;
        let local = self.routines_local(now_ms);
        let goal_minutes = u32::from(self.settings().review_focus_goal_hours) * 60;
        store
            .read(|txn| {
                let (from, to) = look_back_range(planned);
                let look = look_back::build(
                    txn,
                    (local.today, local.offset_min),
                    (from, to),
                    goal_minutes,
                )?;
                let current = week_row(txn, &planned.to_iso())?;
                let previous = week_row(txn, &from.to_iso())?;
                Ok(WeeklyView {
                    week_start: planned.to_iso(),
                    label: words::week_label(planned),
                    look_back: look,
                    answers: answers(txn, current.as_ref())?,
                    last_improvement: previous
                        .and_then(|row| row.improvement)
                        .map(|text| words::last_improvement(&text)),
                    completed_line: current
                        .as_ref()
                        .is_some_and(|row| row.completed_at.is_some())
                        .then(|| words::completed_line(true).to_owned()),
                })
            })
            .map_err(|error: StoreError| {
                eprintln!("review: could not read the weekly review ({error})");
                ReviewError::Store
            })
    }
}

fn week_row(txn: &Txn, week_start: &str) -> Result<Option<ReflectionRow>, StoreError> {
    let id = reflection_id(ReflectionKind::Week, week_start);
    Ok(live(reflections::get(txn, &id)?))
}

fn answers(txn: &Txn, row: Option<&ReflectionRow>) -> Result<WeeklyAnswers, StoreError> {
    let Some(row) = row else {
        return Ok(WeeklyAnswers {
            improvement: None,
            notes: None,
            priorities: Vec::new(),
        });
    };
    Ok(WeeklyAnswers {
        improvement: row.improvement.clone(),
        notes: row.notes.clone(),
        priorities: priorities(txn, &row.priorities)?,
    })
}
