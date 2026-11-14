//! A run as the webview sees it: its steps in the order frozen at start, each with today's
//! name and detail, and the line Rust words for it (ADR-011).

use orasenda_core::LocalDate;
use orasenda_store::routines::habits::{self, HabitRow};
use orasenda_store::routines::routine_runs::{self, RunOutcome, RunRow, StepAnswer};
use orasenda_store::routines::{self as routine_rows, RoutineRow};
use orasenda_store::{StoreError, Txn};

use super::words;
use crate::api::{RunStepView, RunView, StepState};

/// What a step shows when its habit row is gone altogether (never synced here).
const GONE: &str = "A removed step";

/// A run with the rows its view needs: its routine and every habit it names, removed ones
/// included (a removed habit's step still shows its name).
pub struct RunRows {
    run: RunRow,
    routine: Option<RoutineRow>,
    habits: Vec<Option<HabitRow>>,
}

/// Today's open run, if any, with its rows. A run left open on an earlier day is not today's.
pub fn read_open(txn: &Txn, today: LocalDate) -> Result<Option<RunRows>, StoreError> {
    let day = today.to_iso();
    let open = routine_runs::list_open(txn)?
        .into_iter()
        .rfind(|run| run.day == day);
    open.map(|run| read_rows(txn, run)).transpose()
}

/// The run `id` with its rows, open or ended; `None` when there is no such run.
pub fn read_run(txn: &Txn, id: &str) -> Result<Option<RunRows>, StoreError> {
    routine_runs::get(txn, id)?
        .map(|run| read_rows(txn, run))
        .transpose()
}

fn read_rows(txn: &Txn, run: RunRow) -> Result<RunRows, StoreError> {
    let routine = routine_rows::get(txn, &run.routine_id)?;
    let habits = run
        .step_ids
        .iter()
        .map(|id| habits::get(txn, id))
        .collect::<Result<_, _>>()?;
    Ok(RunRows {
        run,
        routine,
        habits,
    })
}

/// Whether the habit behind a step is live.
pub fn live(habit: Option<&HabitRow>) -> bool {
    habit.is_some_and(|row| row.deleted_at.is_none())
}

/// The view of `rows`. An answered step keeps its answer. An unanswered step whose habit was
/// removed reads as *skipped*, and the current step is the first unanswered live one.
pub fn view(rows: &RunRows) -> RunView {
    let run = &rows.run;
    let steps: Vec<RunStepView> = rows
        .habits
        .iter()
        .enumerate()
        .map(|(index, habit)| step_view(run, index, habit.as_ref()))
        .collect();
    let current = run
        .is_open()
        .then(|| {
            steps
                .iter()
                .position(|step| step.state == StepState::Upcoming)
        })
        .flatten()
        .and_then(|index| u16::try_from(index).ok());
    let count = |state| {
        let n = steps.iter().filter(|step| step.state == state).count();
        u16::try_from(n).unwrap_or(u16::MAX)
    };
    let (done, skipped) = (count(StepState::Done), count(StepState::Skipped));
    let total = u16::try_from(steps.len()).unwrap_or(u16::MAX);
    let line = match (current, run.outcome) {
        (Some(index), _) => format!("Step {} of {total}", index + 1),
        (None, Some(RunOutcome::Stopped)) => {
            format!("Routine ended. {done} of {total} done today.")
        }
        (None, _) => format!("Routine finished. {done} of {total} done today."),
    };
    let routine = rows.routine.as_ref();
    RunView {
        id: run.id.clone(),
        routine_id: run.routine_id.clone(),
        routine_name: routine.map(|r| r.fields.name.clone()).unwrap_or_default(),
        steps,
        current,
        done,
        skipped,
        total,
        wellness: routine.is_some_and(|r| {
            r.template
                .as_deref()
                .and_then(orasenda_core::TemplateId::parse)
                .is_some()
        }),
        line,
    }
}

fn step_view(run: &RunRow, index: usize, habit: Option<&HabitRow>) -> RunStepView {
    let state = match run.answers.get(index) {
        Some(StepAnswer::Done) => StepState::Done,
        Some(StepAnswer::Skipped) => StepState::Skipped,
        None if live(habit) => StepState::Upcoming,
        None => StepState::Skipped,
    };
    let Some(habit) = habit else {
        return RunStepView {
            habit_id: run.step_ids[index].clone(),
            name: GONE.to_owned(),
            detail: Vec::new(),
            optional: false,
            state,
        };
    };
    RunStepView {
        habit_id: habit.id.clone(),
        name: habit.fields.name.clone(),
        detail: detail(habit),
        optional: habit.fields.optional,
        state,
    }
}

/// The intention, the anchor line, "2-minute version: one sip." and the identity, as present.
fn detail(habit: &HabitRow) -> Vec<String> {
    let f = &habit.fields;
    let mut lines = vec![words::intention(
        &f.name,
        f.when_text.as_deref(),
        f.where_text.as_deref(),
    )];
    lines.extend(words::anchor_line(f.anchor.as_deref(), &f.name));
    lines.extend(f.two_minute.as_deref().map(two_minute_line));
    lines.extend(f.identity.clone());
    lines
}

/// "2-minute version: one sip."
pub fn two_minute_line(text: &str) -> String {
    let text = text.trim().trim_end_matches('.').trim_end();
    format!("2-minute version: {text}.")
}
