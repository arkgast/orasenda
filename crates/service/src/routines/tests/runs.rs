//! The run commands: start, step, end, the run rules, the view of the open run, the events and
//! the failures.

use orasenda_core::TemplateId;
use orasenda_store::routines::routine_runs::{self, RunOutcome};

use super::super::*;
use super::*;
use crate::api::{RoutineToday, RoutinesError, RunView, StepOutcome, StepState};
use crate::session::lock;
use crate::session::test_support::{T0, db};

/// A routine "Morning" with three habits; answers its id and the habit ids.
fn morning(host: &TestHost) -> (String, Vec<String>) {
    let r = run_routine_create(host, &routine("Morning")).unwrap();
    let mut water = habit("Drink a glass of water");
    water.when_text = Some("7:00".into());
    water.anchor = Some("I wake up".into());
    water.two_minute = Some("one sip".into());
    water.identity = Some("I am someone who looks after my body.".into());
    let ids = [water, habit("Stretch"), habit("Plan the day")]
        .iter()
        .map(|draft| run_habit_create(host, Some(&r), draft).unwrap())
        .collect();
    host.log().take();
    (r, ids)
}

fn states(run: &RunView) -> Vec<StepState> {
    run.steps.iter().map(|step| step.state).collect()
}

fn stored(host: &TestHost, id: &str) -> routine_runs::RunRow {
    db(&lock(&host.0.service))
        .read(|txn| routine_runs::get(txn, id))
        .unwrap()
        .expect("the run is stored")
}

#[test]
fn start_freezes_the_steps_and_shows_the_open_run() {
    let host = host();
    let (r, ids) = morning(&host);
    let run = run_run_start(&host, &r).expect("starts");
    assert_eq!(run.routine_id, r);
    assert_eq!(run.routine_name, "Morning");
    assert_eq!(
        (run.current, run.done, run.skipped, run.total),
        (Some(0), 0, 0, 3)
    );
    assert_eq!(run.line, "Step 1 of 3");
    assert!(!run.wellness);
    let ids_in_run: Vec<&str> = run.steps.iter().map(|s| s.habit_id.as_str()).collect();
    assert_eq!(
        ids_in_run,
        ids.iter().map(String::as_str).collect::<Vec<_>>()
    );
    assert_eq!(states(&run), vec![StepState::Upcoming; 3]);
    assert_eq!(
        run.steps[0].detail,
        vec![
            "I will drink a glass of water at 7:00.".to_owned(),
            "After I wake up, I will drink a glass of water.".to_owned(),
            "2-minute version: one sip.".to_owned(),
            "I am someone who looks after my body.".to_owned(),
        ]
    );
    assert_eq!(run.steps[1].detail, vec!["I will stretch.".to_owned()]);
    let events = changed(&host);
    assert_eq!(events.len(), 1, "one event after the write");
    assert_eq!(events[0].run.as_ref(), Some(&run));
    assert_eq!(events[0].routines[0].today, RoutineToday::InProgress);
    assert_eq!(run_routines_list(&host).unwrap().run, Some(run.clone()));
    assert_eq!(under_lock(&host), 0);
    // Moving a habit after the start never changes the run's order.
    run_habit_move(&host, &ids[2], 0).unwrap();
    let after = run_routines_list(&host).unwrap().run.unwrap();
    assert_eq!(after.steps[0].habit_id, ids[0]);
}

#[test]
fn done_checks_in_skip_only_counts_and_the_last_answer_finishes() {
    let host = host();
    let (r, ids) = morning(&host);
    let run = run_run_start(&host, &r).unwrap();
    let run = run_run_step(&host, &run.id, StepOutcome::Done).unwrap();
    assert_eq!(
        (run.current, run.done, run.line.as_str()),
        (Some(1), 1, "Step 2 of 3")
    );
    let run = run_run_step(&host, &run.id, StepOutcome::Skip).unwrap();
    assert_eq!((run.current, run.skipped), (Some(2), 1));
    let list = run_routines_list(&host).unwrap();
    let habits = &list.routines[0].habits;
    assert!(habits[0].done_today, "Done checked the habit in");
    assert!(!habits[1].done_today, "Skip wrote no check-in");
    assert_eq!(list.routines[0].today_line, "1 of 3 done today");
    host.log().take();
    let run = run_run_step(&host, &run.id, StepOutcome::Done).unwrap();
    assert_eq!(run.current, None);
    assert_eq!(run.line, "Routine finished. 2 of 3 done today.");
    assert_eq!(
        states(&run),
        vec![StepState::Done, StepState::Skipped, StepState::Done]
    );
    let row = stored(&host, &run.id);
    assert_eq!(row.outcome, Some(RunOutcome::Finished));
    assert_eq!((row.steps_done, row.steps_skipped), (2, 1));
    let view = changed(&host).pop().expect("an event");
    assert_eq!(view.run, None, "a finished run is not open");
    assert_eq!(view.routines[0].today, RoutineToday::Finished);
    assert_eq!(view.routines[0].today_line, "Done today, 2 of 3");
    assert!(view.routines[0].habits[2].done_today);
    let _ = ids;
    // An ended run takes no more answers.
    assert_eq!(
        run_run_step(&host, &run.id, StepOutcome::Done),
        Err(RoutinesError::NotFound)
    );
}

#[test]
fn done_is_idempotent_with_an_earlier_check_in() {
    let host = host();
    let (r, ids) = morning(&host);
    run_habit_check(&host, &ids[0], true).unwrap();
    let run = run_run_start(&host, &r).unwrap();
    let run = run_run_step(&host, &run.id, StepOutcome::Done).unwrap();
    assert_eq!(run.done, 1);
    assert!(run_routines_list(&host).unwrap().routines[0].habits[0].done_today);
}

#[test]
fn run_end_stops_the_run() {
    let host = host();
    let (r, _) = morning(&host);
    let run = run_run_start(&host, &r).unwrap();
    let run = run_run_step(&host, &run.id, StepOutcome::Done).unwrap();
    let ended = run_run_end(&host, &run.id).unwrap();
    assert_eq!(ended.current, None);
    assert_eq!(ended.line, "Routine ended. 1 of 3 done today.");
    assert_eq!(
        states(&ended),
        vec![StepState::Done, StepState::Upcoming, StepState::Upcoming]
    );
    assert_eq!(stored(&host, &run.id).outcome, Some(RunOutcome::Stopped));
    let view = changed(&host).pop().unwrap();
    assert_eq!(view.run, None);
    assert_eq!(view.routines[0].today, RoutineToday::InProgress);
    assert_eq!(run_run_end(&host, &run.id), Err(RoutinesError::NotFound));
    assert_eq!(run_run_end(&host, "nope"), Err(RoutinesError::NotFound));
    // A new run can start once the last one ended.
    assert!(run_run_start(&host, &r).is_ok());
}

#[test]
fn start_refuses_while_a_run_is_open_today() {
    let host = host();
    let (r, _) = morning(&host);
    let other = run_routine_create(&host, &routine("Evening")).unwrap();
    run_habit_create(&host, Some(&other), &habit("Read")).unwrap();
    run_run_start(&host, &r).unwrap();
    host.log().take();
    assert_eq!(run_run_start(&host, &r), Err(RoutinesError::Running));
    assert_eq!(run_run_start(&host, &other), Err(RoutinesError::Running));
    assert!(changed(&host).is_empty(), "a refusal emits nothing");
}

#[test]
fn start_refuses_an_empty_or_missing_routine() {
    let host = host();
    let empty = run_routine_create(&host, &routine("Empty")).unwrap();
    assert_eq!(run_run_start(&host, &empty), Err(RoutinesError::Empty));
    assert_eq!(run_run_start(&host, "nope"), Err(RoutinesError::NotFound));
    run_routine_remove(&host, &empty).unwrap();
    assert_eq!(run_run_start(&host, &empty), Err(RoutinesError::NotFound));
}

#[test]
fn an_open_run_from_an_earlier_day_is_closed_as_stopped() {
    let host = host();
    let (r, _) = morning(&host);
    let run = run_run_start(&host, &r).unwrap();
    host.set_now(T0 + DAY);
    // The view never shows another day's run, even before it is closed.
    assert_eq!(run_routines_list(&host).unwrap().run, None);
    let today = run_run_start(&host, &r).expect("the stale run does not block");
    assert_ne!(today.id, run.id);
    let old = stored(&host, &run.id);
    assert_eq!(old.outcome, Some(RunOutcome::Stopped));
    assert_eq!(old.ended_at, Some(T0 + DAY));
}

#[test]
fn the_first_tick_of_a_new_day_closes_a_stale_run() {
    let host = host();
    let (r, _) = morning(&host);
    let run = run_run_start(&host, &r).unwrap();
    crate::scheduler::iterate(&host);
    assert!(stored(&host, &run.id).is_open(), "today's run stays open");
    host.set_now(T0 + DAY);
    crate::scheduler::iterate(&host);
    assert_eq!(stored(&host, &run.id).outcome, Some(RunOutcome::Stopped));
}

#[test]
fn a_removed_habit_reads_as_skipped_and_is_passed() {
    let host = host();
    let (r, ids) = morning(&host);
    let run = run_run_start(&host, &r).unwrap();
    run_habit_rename(&host, &ids[1], "Stretch slowly");
    run_habit_remove(&host, &ids[1]).unwrap();
    let open = changed(&host).pop().unwrap().run.unwrap();
    assert_eq!(open.steps[1].name, "Stretch slowly", "the new name shows");
    assert_eq!(
        states(&open),
        vec![StepState::Upcoming, StepState::Skipped, StepState::Upcoming]
    );
    let run = run_run_step(&host, &run.id, StepOutcome::Done).unwrap();
    assert_eq!(run.current, Some(2), "the removed step is passed");
    assert_eq!(run.line, "Step 3 of 3");
    let row = stored(&host, &run.id);
    assert_eq!((row.steps_done, row.steps_skipped), (1, 1));
    let run = run_run_step(&host, &run.id, StepOutcome::Done).unwrap();
    assert_eq!(run.line, "Routine finished. 2 of 3 done today.");
}

#[test]
fn removing_the_last_open_steps_ends_the_run() {
    let host = host();
    let (r, ids) = morning(&host);
    let run = run_run_start(&host, &r).unwrap();
    run_run_step(&host, &run.id, StepOutcome::Done).unwrap();
    run_habit_remove(&host, &ids[1]).unwrap();
    assert!(stored(&host, &run.id).is_open());
    run_habit_remove(&host, &ids[2]).unwrap();
    let row = stored(&host, &run.id);
    assert_eq!(row.outcome, Some(RunOutcome::Finished));
    assert_eq!((row.steps_done, row.steps_skipped), (1, 2));
    assert_eq!(changed(&host).pop().unwrap().run, None);
}

#[test]
fn removing_the_routine_stops_its_run() {
    let host = host();
    let (r, _) = morning(&host);
    let run = run_run_start(&host, &r).unwrap();
    run_routine_remove(&host, &r).unwrap();
    assert_eq!(stored(&host, &run.id).outcome, Some(RunOutcome::Stopped));
    assert_eq!(changed(&host).pop().unwrap().run, None);
    assert_eq!(
        run_run_step(&host, &run.id, StepOutcome::Done),
        Err(RoutinesError::NotFound)
    );
}

#[test]
fn a_template_run_carries_wellness() {
    let host = host();
    let r = run_routine_add_template(&host, TemplateId::MorningLight).unwrap();
    let run = run_run_start(&host, &r).unwrap();
    assert!(run.wellness);
    assert_eq!(run.total, 7);
    assert!(run.steps[4].optional);
}

#[test]
fn a_failed_store_answers_store_and_writes_nothing() {
    let host = host();
    let (r, _) = morning(&host);
    db(&lock(&host.0.service)).fail_writes(true);
    assert_eq!(run_run_start(&host, &r), Err(RoutinesError::Store));
    db(&lock(&host.0.service)).fail_writes(false);
    assert!(changed(&host).is_empty());
    assert_eq!(run_routines_list(&host).unwrap().run, None);
}

/// Renames habit `id`, keeping its other fields empty.
fn run_habit_rename(host: &TestHost, id: &str, name: &str) {
    run_habit_update(host, id, &habit(name)).unwrap();
}
