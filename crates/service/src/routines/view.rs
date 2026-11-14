//! The stored routines, habits, check-ins and today's runs as one [`RoutinesView`], worded for
//! the user's local date and hour cycle.

use std::collections::{BTreeMap, BTreeSet};

use orasenda_core::routines::templates;
use orasenda_core::routines::{DayState, day_states, fresh_start, run_of_days};
use orasenda_core::{HourCycle, LocalDate, TemplateId, Weekdays};
use orasenda_store::routines::habit_checks::{self, CheckRow};
use orasenda_store::routines::habits::{self, HabitRow};
use orasenda_store::routines::routine_runs::{self, RunOutcome, RunRow};
use orasenda_store::routines::{self as routine_rows, RoutineRow};
use orasenda_store::{StoreError, Txn};

use super::run_view::{self, RunRows};
use super::words;
use crate::api::{HabitDayState, HabitDotView, HabitView, RoutineToday, RoutineView, RoutinesView};

/// How many local days a dot grid shows.
pub const WINDOW_DAYS: u16 = 28;

/// The local date and clock the view is worded for.
#[derive(Debug, Clone, Copy)]
pub struct Local {
    pub today: LocalDate,
    /// Minutes east of UTC now: the grid uses the current offset (spec: time zone change).
    pub offset_min: i32,
    pub cycle: HourCycle,
}

/// The rows one view needs, read in one transaction.
pub struct Rows {
    routines: Vec<RoutineRow>,
    habits: Vec<HabitRow>,
    checks: Vec<CheckRow>,
    runs_today: Vec<RunRow>,
    run: Option<RunRows>,
}

/// Reads the live routines and habits, their live check-ins back to the oldest habit's first
/// day (the run of days can be longer than the grid), today's runs and today's open run.
pub fn read(txn: &Txn, local: Local) -> Result<Rows, StoreError> {
    let routines = routine_rows::list_live(txn)?;
    let habits = habits::list_all_live(txn)?;
    let ids: Vec<String> = habits.iter().map(|habit| habit.id.clone()).collect();
    let from = habits
        .iter()
        .map(|habit| created(habit, local))
        .min()
        .unwrap_or(local.today);
    let checks = habit_checks::checks_since(txn, &ids, &from.to_iso())?;
    let runs_today = routine_runs::runs_on(txn, &local.today.to_iso())?;
    let run = run_view::read_open(txn, local.today)?;
    Ok(Rows {
        routines,
        habits,
        checks,
        runs_today,
        run,
    })
}

/// The view of `rows`. A stored day mask outside 1–127 is a store error, never a guess.
pub fn build(rows: &Rows, local: Local) -> Result<RoutinesView, StoreError> {
    let mut done: BTreeMap<&str, BTreeSet<LocalDate>> = BTreeMap::new();
    for check in &rows.checks {
        let day = LocalDate::parse_iso(&check.day).ok_or_else(|| bad("a check-in day"))?;
        done.entry(check.habit_id.as_str()).or_default().insert(day);
    }
    let none = BTreeSet::new();
    let done_of = |id: &str| done.get(id).unwrap_or(&none);
    let mut standalone = Vec::new();
    let mut by_routine: BTreeMap<&str, Vec<&HabitRow>> = BTreeMap::new();
    for habit in &rows.habits {
        match habit.routine_id.as_deref() {
            None => standalone.push(habit),
            Some(routine) => by_routine.entry(routine).or_default().push(habit),
        }
    }
    let habits = standalone
        .into_iter()
        .map(|habit| {
            let days = mask(habit.fields.days.unwrap_or(Weekdays::EVERY_DAY.bits()))?;
            Ok(habit_view(habit, days, done_of(&habit.id), local))
        })
        .collect::<Result<_, StoreError>>()?;
    let routines = rows
        .routines
        .iter()
        .map(|routine| {
            let days = mask(routine.fields.days)?;
            let habits: Vec<HabitView> = by_routine
                .get(routine.id.as_str())
                .into_iter()
                .flatten()
                .map(|habit| habit_view(habit, days, done_of(&habit.id), local))
                .collect();
            Ok(routine_view(routine, days, habits, &rows.runs_today, local))
        })
        .collect::<Result<_, StoreError>>()?;
    Ok(RoutinesView {
        routines,
        habits,
        run: rows.run.as_ref().map(run_view::view),
    })
}

fn routine_view(
    row: &RoutineRow,
    days: Weekdays,
    habits: Vec<HabitView>,
    runs_today: &[RunRow],
    local: Local,
) -> RoutineView {
    let note = row
        .template
        .as_deref()
        .and_then(TemplateId::parse)
        .map(|id| templates::get(id).note.to_owned());
    let done = habits.iter().filter(|habit| habit.done_today).count();
    let total = habits.len();
    let runs: Vec<&RunRow> = runs_today
        .iter()
        .filter(|run| run.routine_id == row.id)
        .collect();
    let today = if runs
        .iter()
        .any(|run| run.outcome == Some(RunOutcome::Finished))
        || (total > 0 && done == total)
    {
        RoutineToday::Finished
    } else if done > 0 || runs.iter().any(|run| run.is_open()) {
        RoutineToday::InProgress
    } else {
        RoutineToday::NotStarted
    };
    RoutineView {
        id: row.id.clone(),
        name: row.fields.name.clone(),
        time_of_day: row.fields.time_of_day,
        time: row
            .fields
            .time_of_day
            .map(|minute| words::time_label(minute, local.cycle)),
        days: days.bits(),
        days_label: days.label(),
        wellness: note.is_some(),
        note,
        habits,
        today,
        today_line: words::today_line(today, done, total),
    }
}

fn habit_view(
    row: &HabitRow,
    days: Weekdays,
    done: &BTreeSet<LocalDate>,
    local: Local,
) -> HabitView {
    let f = &row.fields;
    let created = created(row, local);
    let dots = day_states(created, local.today, days, done, WINDOW_DAYS)
        .into_iter()
        .map(|dot| HabitDotView {
            state: match dot.state {
                DayState::Done => HabitDayState::Done,
                DayState::NotDone => HabitDayState::NotDone,
                DayState::Rest => HabitDayState::Rest,
                DayState::Upcoming => HabitDayState::Upcoming,
            },
            today: dot.today,
            label: dot.date.label(),
        })
        .collect();
    let standalone = row.routine_id.is_none();
    HabitView {
        id: row.id.clone(),
        routine_id: row.routine_id.clone(),
        name: f.name.clone(),
        when_text: f.when_text.clone(),
        where_text: f.where_text.clone(),
        anchor: f.anchor.clone(),
        two_minute: f.two_minute.clone(),
        identity: f.identity.clone(),
        optional: f.optional,
        days: standalone.then_some(days.bits()),
        days_label: standalone.then(|| days.label()),
        intention: words::intention(&f.name, f.when_text.as_deref(), f.where_text.as_deref()),
        anchor_line: words::anchor_line(f.anchor.as_deref(), &f.name),
        dots,
        done_today: done.contains(&local.today),
        run_line: words::run_line(run_of_days(created, local.today, days, done)),
        fresh_start: fresh_start(created, local.today, days, done)
            .then(|| words::FRESH_START.to_owned()),
    }
}

/// The local date a habit was made on, in the current offset.
fn created(habit: &HabitRow, local: Local) -> LocalDate {
    LocalDate::from_epoch_ms(habit.created_at, local.offset_min)
}

fn mask(bits: u8) -> Result<Weekdays, StoreError> {
    Weekdays::from_bits(bits).ok_or_else(|| bad("a day mask"))
}

fn bad(what: &str) -> StoreError {
    StoreError::Sqlite(format!("{what} is out of range"))
}
