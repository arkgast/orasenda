//! The habit commands, check-ins, the dot grid, the run of days and the fresh-start line.

use super::super::*;
use super::*;
use crate::api::{HabitDayState, RoutineToday, RoutinesError};
use crate::session::test_support::T0;

fn full_draft() -> HabitDraft {
    HabitDraft {
        name: "  Drink a glass of water ".into(),
        when_text: Some(" 7:00 ".into()),
        where_text: Some("the kitchen".into()),
        anchor: Some("I wake up".into()),
        two_minute: Some(" one sip".into()),
        identity: Some("   ".into()),
        optional: true,
        days: Some(31),
    }
}

#[test]
fn standalone_habit_is_trimmed_and_worded() {
    let host = host();
    let id = run_habit_create(&host, None, &full_draft()).expect("saves");
    let view = changed(&host).pop().expect("an event");
    let h = &view.habits[0];
    assert_eq!(h.id, id);
    assert_eq!(h.routine_id, None);
    assert_eq!(h.name, "Drink a glass of water");
    assert_eq!(h.when_text.as_deref(), Some("7:00"));
    assert_eq!(h.two_minute.as_deref(), Some("one sip"));
    assert_eq!(h.identity, None, "an empty text becomes None");
    assert!(h.optional);
    assert_eq!(
        (h.days, h.days_label.as_deref()),
        (Some(31), Some("Weekdays"))
    );
    assert_eq!(
        h.intention,
        "I will drink a glass of water at 7:00 in the kitchen."
    );
    assert_eq!(
        h.anchor_line.as_deref(),
        Some("After I wake up, I will drink a glass of water.")
    );
    assert!(!h.done_today);
    assert_eq!((h.run_line.as_ref(), h.fresh_start.as_ref()), (None, None));
    assert_eq!(under_lock(&host), 0);
}

#[test]
fn standalone_habit_without_days_runs_every_day() {
    let host = host();
    run_habit_create(&host, None, &habit("Walk")).unwrap();
    let h = &run_routines_list(&host).unwrap().habits[0];
    assert_eq!(
        (h.days, h.days_label.as_deref()),
        (Some(127), Some("Every day"))
    );
}

#[test]
fn a_routine_habit_keeps_no_days_of_its_own() {
    let host = host();
    let r = run_routine_create(&host, &routine("R")).unwrap();
    run_habit_create(&host, Some(&r), &full_draft()).unwrap();
    let view = run_routines_list(&host).unwrap();
    assert!(view.habits.is_empty());
    let h = &view.routines[0].habits[0];
    assert_eq!((h.days, h.days_label.as_ref()), (None, None));
    assert_eq!(h.routine_id.as_deref(), Some(r.as_str()));
}

#[test]
fn habit_refusals() {
    let host = host();
    assert_eq!(
        run_habit_create(&host, None, &habit(" ")),
        Err(RoutinesError::Empty)
    );
    assert_eq!(
        run_habit_create(&host, Some("no-such-routine"), &habit("x")),
        Err(RoutinesError::NotFound)
    );
    let mut long = habit("x");
    long.where_text = Some("w".repeat(81));
    assert_eq!(
        run_habit_create(&host, None, &long),
        Err(RoutinesError::TooLong)
    );
    long.where_text = Some("w".repeat(80));
    long.identity = Some("i".repeat(121));
    assert_eq!(
        run_habit_create(&host, None, &long),
        Err(RoutinesError::TooLong)
    );
    long.identity = Some("i".repeat(120));
    long.days = Some(0);
    assert_eq!(
        run_habit_create(&host, None, &long),
        Err(RoutinesError::Empty)
    );
    long.where_text = Some("w".repeat(81));
    assert_eq!(
        run_habit_create(&host, None, &long),
        Err(RoutinesError::TooLong),
        "ruling 5: the field checks come before the days"
    );
    long.where_text = Some("w".repeat(80));
    long.days = Some(31);
    assert!(run_habit_create(&host, None, &long).is_ok());
    assert_eq!(
        run_habit_update(&host, "missing", &habit("x")),
        Err(RoutinesError::NotFound)
    );
}

#[test]
fn full_at_twenty_per_routine_and_thirty_standalone() {
    let host = host();
    let r = run_routine_create(&host, &routine("R")).unwrap();
    for n in 0..MAX_ROUTINE_HABITS {
        run_habit_create(&host, Some(&r), &habit(&format!("s{n}"))).unwrap();
    }
    assert_eq!(
        run_habit_create(&host, Some(&r), &habit("one more")),
        Err(RoutinesError::Full)
    );
    let first = run_habit_create(&host, None, &habit("h0")).unwrap();
    for n in 1..MAX_STANDALONE_HABITS {
        run_habit_create(&host, None, &habit(&format!("h{n}"))).unwrap();
    }
    assert_eq!(
        run_habit_create(&host, None, &habit("one more")),
        Err(RoutinesError::Full)
    );
    run_habit_remove(&host, &first).unwrap();
    run_habit_create(&host, None, &habit("in its place")).unwrap();
    assert_eq!(run_habit_restore(&host, &first), Err(RoutinesError::Full));
}

#[test]
fn update_move_remove_restore_habits() {
    let host = host();
    let r = run_routine_create(&host, &routine("R")).unwrap();
    let a = run_habit_create(&host, Some(&r), &habit("A")).unwrap();
    let b = run_habit_create(&host, Some(&r), &habit("B")).unwrap();
    run_habit_update(&host, &a, &habit("  A2 ")).unwrap();
    run_habit_move(&host, &b, 0).unwrap();
    let names = |host: &TestHost| -> Vec<String> {
        run_routines_list(host).unwrap().routines[0]
            .habits
            .iter()
            .map(|h| h.name.clone())
            .collect()
    };
    assert_eq!(names(&host), ["B", "A2"]);
    run_habit_remove(&host, &b).unwrap();
    assert_eq!(names(&host), ["A2"]);
    assert_eq!(run_habit_remove(&host, &b), Err(RoutinesError::NotFound));
    assert_eq!(run_habit_move(&host, &b, 0), Err(RoutinesError::NotFound));
    run_habit_restore(&host, &b).unwrap();
    assert_eq!(names(&host), ["B", "A2"]);
    assert_eq!(run_habit_restore(&host, &b), Err(RoutinesError::NotFound));
    // A habit whose routine is removed can't come back on its own.
    run_habit_remove(&host, &a).unwrap();
    run_routine_remove(&host, &r).unwrap();
    assert_eq!(run_habit_restore(&host, &a), Err(RoutinesError::NotFound));
}

#[test]
fn check_in_is_idempotent_and_sets_today() {
    let host = host();
    let r = run_routine_create(&host, &routine("R")).unwrap();
    let a = run_habit_create(&host, Some(&r), &habit("A")).unwrap();
    let b = run_habit_create(&host, Some(&r), &habit("B")).unwrap();
    changed(&host);
    run_habit_check(&host, &a, true).unwrap();
    run_habit_check(&host, &a, true).unwrap();
    let view = changed(&host).pop().unwrap();
    let routine = &view.routines[0];
    assert!(routine.habits[0].done_today);
    let today = routine.habits[0].dots.last().unwrap();
    assert!(today.today);
    assert_eq!(today.state, HabitDayState::Done);
    assert_eq!(today.label, "Saturday 7 November");
    assert_eq!(
        (routine.today, routine.today_line.as_str()),
        (RoutineToday::InProgress, "1 of 2 done today")
    );
    run_habit_check(&host, &b, true).unwrap();
    let routine = &run_routines_list(&host).unwrap().routines[0];
    assert_eq!(
        (routine.today, routine.today_line.as_str()),
        (RoutineToday::Finished, "Done today, 2 of 2")
    );
    run_habit_check(&host, &a, false).unwrap();
    run_habit_check(&host, &a, false).unwrap();
    let routine = &run_routines_list(&host).unwrap().routines[0];
    assert!(!routine.habits[0].done_today);
    assert_eq!(
        routine.habits[0].dots.last().unwrap().state,
        HabitDayState::Upcoming
    );
    assert_eq!(
        run_habit_check(&host, "missing", true),
        Err(RoutinesError::NotFound)
    );
}

#[test]
fn dot_view_has_weekday() {
    let host = host();
    let r = run_routine_create(&host, &routine("Morning")).unwrap();
    run_habit_create(&host, Some(&r), &habit("A")).unwrap();
    let dots = run_routines_list(&host).unwrap().routines[0].habits[0]
        .dots
        .clone();
    // T0 is Saturday 7 November: Saturday is 5, and the days before count back from it.
    assert_eq!(dots.last().unwrap().weekday, 5);
    let weekdays: Vec<u8> = dots.iter().map(|d| d.weekday).collect();
    assert!(weekdays.windows(2).all(|w| w[1] == (w[0] + 1) % 7));
}

#[test]
fn dots_run_line_and_fresh_start_over_days() {
    let host = host();
    let id = run_habit_create(&host, None, &habit("Walk")).unwrap();
    let dots = |host: &TestHost| run_routines_list(host).unwrap().habits[0].clone();
    assert_eq!(
        dots(&host).dots.len(),
        1,
        "days before the habit are left out"
    );
    // Done three days in a row.
    for day in 0..3 {
        host.set_now(T0 + day * DAY);
        run_habit_check(&host, &id, true).unwrap();
    }
    let h = dots(&host);
    assert_eq!(h.dots.len(), 3);
    assert_eq!(h.run_line.as_deref(), Some("3 days kept"));
    // One day off is forgiven; today is still open.
    host.set_now(T0 + 4 * DAY);
    let h = dots(&host);
    assert_eq!(h.dots[3].state, HabitDayState::NotDone);
    assert_eq!(h.dots[4].state, HabitDayState::Upcoming);
    assert_eq!(h.run_line.as_deref(), Some("3 days kept"));
    assert_eq!(h.fresh_start, None);
    // Two in a row: the fresh-start line, and no run line.
    host.set_now(T0 + 5 * DAY);
    let h = dots(&host);
    assert_eq!(h.run_line, None);
    assert_eq!(
        h.fresh_start.as_deref(),
        Some("Two days off. Today is a fresh start.")
    );
    run_habit_check(&host, &id, true).unwrap();
    assert_eq!(dots(&host).fresh_start, None, "checking in today clears it");
    // The grid keeps 28 days.
    host.set_now(T0 + 40 * DAY);
    assert_eq!(dots(&host).dots.len(), usize::from(WINDOW_DAYS));
}

#[test]
fn rest_days_follow_the_routine_days() {
    let host = host();
    let mut weekdays = routine("Work");
    weekdays.days = 31;
    let r = run_routine_create(&host, &weekdays).unwrap();
    run_habit_create(&host, Some(&r), &habit("Plan")).unwrap();
    // T0 is a Saturday: today is a rest day, not upcoming.
    let h = &run_routines_list(&host).unwrap().routines[0].habits[0];
    assert_eq!(h.dots[0].state, HabitDayState::Rest);
}
