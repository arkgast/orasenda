//! Running a routine step by step (spec 2026-11-14, §Service and IPC, run rules): `run_start`,
//! `run_step` and `run_end`.
//!
//! The run lives in its `routine_run` row (Decision 8), with the step order frozen at start.
//! One run is open at a time. A run left open on an earlier day is closed as `stopped` on the
//! new day: by the scheduler's first tick of the day, and before any run command. `Done`
//! checks the step's habit in for today; `Skip` writes only the run's counts. A step whose
//! habit was removed is recorded as skipped when the run reaches it, and answering the last
//! step ends the run as `finished`.

use orasenda_core::LocalDate;
use orasenda_store::routines::habit_checks;
use orasenda_store::routines::habits;
use orasenda_store::routines::routine_runs::{self, NewRun, RunOutcome, RunRow, StepAnswer};
use orasenda_store::routines::{self as routine_rows};
use orasenda_store::{StoreError, Txn};
use uuid::Uuid;

use super::run_view::{self, live};
use super::service::Answer;
use crate::api::{RoutinesError, RunView, StepOutcome};
use crate::scheduler::Host;

/// `run_start`: starts routine `routine_id` with its live habits in their current order.
/// Refuses with `Running` while another run is open today, `Empty` for a routine with no
/// habits, and `NotFound` for a routine that is not live.
pub fn run_run_start<H: Host>(host: &H, routine_id: &str) -> Result<RunView, RoutinesError> {
    super::write(host, |txn, local| start(txn, routine_id, local.today))
}

/// `run_step`: answers the current step of the open run `run_id`.
pub fn run_run_step<H: Host>(
    host: &H,
    run_id: &str,
    outcome: StepOutcome,
) -> Result<RunView, RoutinesError> {
    super::write(host, |txn, local| step(txn, run_id, outcome, local.today))
}

/// `run_end`: ends the open run `run_id` as `stopped`.
pub fn run_run_end<H: Host>(host: &H, run_id: &str) -> Result<RunView, RoutinesError> {
    super::write(host, |txn, local| end(txn, run_id, local.today))
}

/// Starts a run of `routine_id` on `today`.
pub fn start(txn: &mut Txn, routine_id: &str, today: LocalDate) -> Answer<RunView> {
    close_stale(txn, today)?;
    if routine_rows::get(txn, routine_id)?.is_none_or(|row| row.deleted_at.is_some()) {
        return Ok(Err(RoutinesError::NotFound));
    }
    if !routine_runs::list_open(txn)?.is_empty() {
        return Ok(Err(RoutinesError::Running));
    }
    let step_ids: Vec<String> = habits::list_live(txn, Some(routine_id))?
        .into_iter()
        .map(|habit| habit.id)
        .collect();
    if step_ids.is_empty() {
        return Ok(Err(RoutinesError::Empty));
    }
    let id = Uuid::now_v7().to_string();
    let run = NewRun {
        id: id.clone(),
        routine_id: routine_id.to_owned(),
        day: today.to_iso(),
        step_ids,
    };
    routine_runs::start(txn, &run)?;
    answered(txn, &id)
}

/// Answers the current step of the open run `run_id` on `today`.
pub fn step(
    txn: &mut Txn,
    run_id: &str,
    outcome: StepOutcome,
    today: LocalDate,
) -> Answer<RunView> {
    close_stale(txn, today)?;
    let Some(run) = routine_runs::get(txn, run_id)?.filter(RunRow::is_open) else {
        return Ok(Err(RoutinesError::NotFound));
    };
    // Steps removed since the last answer are passed first, so the answer lands on a live one.
    let run = settle(txn, run)?;
    if !run.is_open() {
        // Settling ended it (its last steps were removed outside the service): the answer is
        // the finished run, so routines-changed goes out.
        return answered(txn, run_id);
    }
    let habit_id = run.step_ids[run.answers.len()].clone();
    let answer = match outcome {
        StepOutcome::Done => {
            habit_checks::check_in(txn, &habit_id, &today.to_iso())?;
            StepAnswer::Done
        }
        StepOutcome::Skip => StepAnswer::Skipped,
    };
    let Some(run) = routine_runs::answer(txn, run_id, answer)? else {
        return Err(StoreError::Sqlite("an open run took no answer".into()));
    };
    settle(txn, run)?;
    answered(txn, run_id)
}

/// Ends the open run `run_id` as `stopped`.
pub fn end(txn: &mut Txn, run_id: &str, today: LocalDate) -> Answer<RunView> {
    close_stale(txn, today)?;
    if routine_runs::end(txn, run_id, RunOutcome::Stopped)?.is_none() {
        return Ok(Err(RoutinesError::NotFound));
    }
    answered(txn, run_id)
}

/// Closes every run left open on a day before `today` as `stopped`. Returns how many.
pub fn close_stale(txn: &mut Txn, today: LocalDate) -> Result<usize, StoreError> {
    let day = today.to_iso();
    let mut closed = 0;
    for run in routine_runs::list_open(txn)? {
        if run.day != day && routine_runs::end(txn, &run.id, RunOutcome::Stopped)?.is_some() {
            closed += 1;
        }
    }
    Ok(closed)
}

/// Ends the open run of `routine_id`, if any, as `stopped`: its routine was removed.
pub fn stop_routine(txn: &mut Txn, routine_id: &str) -> Result<(), StoreError> {
    if let Some(run) = routine_runs::open_run(txn, routine_id)? {
        routine_runs::end(txn, &run.id, RunOutcome::Stopped)?;
    }
    Ok(())
}

/// Settles every open run after a habit was removed, so a run whose remaining steps are all
/// gone ends instead of waiting on a step that can't be answered.
pub fn settle_open(txn: &mut Txn) -> Result<(), StoreError> {
    for run in routine_runs::list_open(txn)? {
        settle(txn, run)?;
    }
    Ok(())
}

/// Records the steps at the head of `run` whose habit was removed as skipped, then ends the
/// run as `finished` when every step is answered. Returns the run as it now is.
fn settle(txn: &mut Txn, mut run: RunRow) -> Result<RunRow, StoreError> {
    while run.is_open() {
        let Some(next) = run.step_ids.get(run.answers.len()) else {
            return Ok(routine_runs::end(txn, &run.id, RunOutcome::Finished)?.unwrap_or(run));
        };
        if live(habits::get(txn, next)?.as_ref()) {
            break;
        }
        let Some(skipped) = routine_runs::answer(txn, &run.id, StepAnswer::Skipped)? else {
            return Err(StoreError::Sqlite("an open run took no answer".into()));
        };
        run = skipped;
    }
    Ok(run)
}

/// The view of run `id` as this transaction sees it.
fn answered(txn: &Txn, id: &str) -> Answer<RunView> {
    match run_view::read_run(txn, id)? {
        Some(rows) => Ok(Ok(run_view::view(&rows))),
        None => Err(StoreError::Sqlite(
            "a run just written can't be read".into(),
        )),
    }
}
