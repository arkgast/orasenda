//! The routine commands: create, templates, update, move, remove, restore, limits, events and
//! failures.

use orasenda_core::TemplateId;
use orasenda_store::routines as rows;

use super::super::*;
use super::*;
use crate::api::{RoutineToday, RoutinesError};
use crate::session::test_support::{T0, db};

fn names(view: &RoutinesView) -> Vec<&str> {
    view.routines.iter().map(|r| r.name.as_str()).collect()
}

#[test]
fn list_on_a_fresh_install_is_empty_with_no_run() {
    let view = run_routines_list(&host()).expect("lists");
    assert!(view.routines.is_empty());
    assert!(view.habits.is_empty());
    assert_eq!(view.run, None);
}

#[test]
fn create_trims_words_and_emits_after_unlock() {
    let host = host();
    let mut draft = routine("  Morning  ");
    draft.days = 1 | 4 | 16;
    let id = run_routine_create(&host, &draft).expect("saves");
    assert_eq!(id.len(), 36);
    assert_eq!(id.as_bytes()[14], b'7', "a UUIDv7");
    let events = changed(&host);
    assert_eq!(events.len(), 1);
    let r = &events[0].routines[0];
    assert_eq!(r.id, id);
    assert_eq!(r.name, "Morning");
    assert_eq!(r.time_of_day, Some(420));
    assert_eq!(r.time.as_deref(), Some("7:00 AM"), "12-hour clock");
    assert_eq!((r.days, r.days_label.as_str()), (21, "Mon, Wed, Fri"));
    assert!(!r.wellness);
    assert_eq!(r.note, None);
    assert_eq!(r.today, RoutineToday::NotStarted);
    assert_eq!(r.today_line, "Not started today");
    assert_eq!(under_lock(&host), 0);
    assert_eq!(run_routines_list(&host).unwrap(), events[0]);
}

#[test]
fn create_any_time_has_no_time() {
    let host = host();
    let mut draft = routine("Whenever");
    draft.time_of_day = None;
    run_routine_create(&host, &draft).unwrap();
    let r = &run_routines_list(&host).unwrap().routines[0];
    assert_eq!((r.time_of_day, r.time.as_deref()), (None, None));
}

#[test]
fn create_refuses_empty_too_long_and_out_of_range() {
    let host = host();
    for (name, days, time, error) in [
        ("   ", 127, None, RoutinesError::Empty),
        ("Fine", 0, None, RoutinesError::Empty),
        ("Fine", 128, None, RoutinesError::TooLong),
        ("Fine", 127, Some(1440), RoutinesError::TooLong),
    ] {
        let draft = RoutineDraft {
            name: name.into(),
            time_of_day: time,
            days,
        };
        assert_eq!(
            run_routine_create(&host, &draft),
            Err(error),
            "{name} {days}"
        );
    }
    let longest = "é".repeat(80);
    assert!(run_routine_create(&host, &routine(&format!(" {longest} "))).is_ok());
    assert_eq!(
        run_routine_create(&host, &routine(&"é".repeat(81))),
        Err(RoutinesError::TooLong)
    );
    assert_eq!(run_routines_list(&host).unwrap().routines.len(), 1);
    assert_eq!(changed(&host).len(), 1, "a refusal emits nothing");
}

#[test]
fn full_at_thirty_routines_and_restore_respects_it() {
    let host = host();
    let first = run_routine_create(&host, &routine("r0")).unwrap();
    for n in 1..MAX_ROUTINES {
        run_routine_create(&host, &routine(&format!("r{n}"))).unwrap();
    }
    assert_eq!(
        run_routine_create(&host, &routine("one more")),
        Err(RoutinesError::Full)
    );
    assert_eq!(
        run_routine_add_template(&host, TemplateId::WindDown),
        Err(RoutinesError::Full)
    );
    run_routine_remove(&host, &first).unwrap();
    run_routine_create(&host, &routine("in its place")).unwrap();
    assert_eq!(run_routine_restore(&host, &first), Err(RoutinesError::Full));
}

#[test]
fn templates_word_their_times_and_notes() {
    let templates = run_routine_templates(&host()).expect("lists");
    assert_eq!(templates.len(), 5);
    assert_eq!(templates[0].id, TemplateId::MorningLight);
    assert_eq!(templates[0].name, "Morning Light & Movement");
    assert_eq!(templates[0].time.as_deref(), Some("7:00 AM"));
    assert_eq!(templates[0].steps.len(), 7);
    assert!(
        templates[0]
            .note
            .starts_with("Wellness suggestion, not medical advice.")
    );
    assert_eq!(templates[2].time, None, "Study Session is any time");
    assert_eq!(templates[3].time.as_deref(), Some("5:30 PM"));
}

#[test]
fn add_template_copies_an_editable_routine_with_its_note() {
    let host = host();
    let id = run_routine_add_template(&host, TemplateId::MorningLight).expect("adds");
    let view = run_routines_list(&host).unwrap();
    let r = &view.routines[0];
    assert_eq!(r.id, id);
    assert_eq!(r.name, "Morning Light & Movement");
    assert_eq!(
        (r.time.as_deref(), r.days_label.as_str()),
        (Some("7:00 AM"), "Every day")
    );
    assert!(r.wellness);
    assert!(r.note.as_deref().unwrap().contains("Huberman Lab"));
    assert_eq!(r.habits.len(), 7);
    assert_eq!(r.habits[0].name, "Drink a glass of water");
    assert_eq!(r.habits[0].two_minute.as_deref(), Some("one sip"));
    assert_eq!(r.habits[0].routine_id.as_deref(), Some(id.as_str()));
    assert_eq!(
        (r.habits[0].days, r.habits[0].days_label.as_deref()),
        (None, None)
    );
    assert!(r.habits[4].optional);
    assert_eq!(r.today_line, "Not started today");
    // Editing the copy changes the routine, never the template, and the note stays.
    let mut draft = routine("My mornings");
    draft.days = 31;
    run_routine_update(&host, &id, &draft).unwrap();
    let edited = &run_routines_list(&host).unwrap().routines[0];
    assert_eq!(
        (edited.name.as_str(), edited.days_label.as_str()),
        ("My mornings", "Weekdays")
    );
    assert!(edited.wellness);
    assert_eq!(
        run_routine_templates(&host).unwrap()[0].name,
        "Morning Light & Movement"
    );
}

#[test]
fn update_move_remove_restore() {
    let host = host();
    let a = run_routine_create(&host, &routine("A")).unwrap();
    let b = run_routine_create(&host, &routine("B")).unwrap();
    let c = run_routine_create(&host, &routine("C")).unwrap();
    changed(&host);
    run_routine_move(&host, &c, 0).unwrap();
    assert_eq!(names(&run_routines_list(&host).unwrap()), ["C", "A", "B"]);
    run_routine_move(&host, &c, 99).unwrap();
    assert_eq!(names(&run_routines_list(&host).unwrap()), ["A", "B", "C"]);
    run_routine_remove(&host, &b).unwrap();
    assert_eq!(names(&run_routines_list(&host).unwrap()), ["A", "C"]);
    assert_eq!(run_routine_remove(&host, &b), Err(RoutinesError::NotFound));
    assert_eq!(
        run_routine_update(&host, &b, &routine("Z")),
        Err(RoutinesError::NotFound)
    );
    assert_eq!(run_routine_move(&host, &b, 0), Err(RoutinesError::NotFound));
    run_routine_restore(&host, &b).unwrap();
    assert_eq!(names(&run_routines_list(&host).unwrap()), ["A", "B", "C"]);
    assert_eq!(run_routine_restore(&host, &a), Err(RoutinesError::NotFound));
    assert_eq!(changed(&host).len(), 4, "one event per committed write");
    assert_eq!(under_lock(&host), 0);
}

#[test]
fn remove_takes_its_habits_and_restore_brings_them_back() {
    let host = host();
    let r = run_routine_create(&host, &routine("R")).unwrap();
    let h = run_habit_create(&host, Some(&r), &habit("Step")).unwrap();
    run_routine_remove(&host, &r).unwrap();
    assert_eq!(
        run_habit_check(&host, &h, true),
        Err(RoutinesError::NotFound)
    );
    run_routine_restore(&host, &r).unwrap();
    assert_eq!(
        run_routines_list(&host).unwrap().routines[0].habits[0].id,
        h
    );
}

#[test]
fn a_store_failure_is_an_error_never_an_empty_list() {
    let host = host();
    run_routine_create(&host, &routine("Kept")).unwrap();
    changed(&host);
    db(&lock(&host.0.service)).fail_reads(true);
    assert_eq!(run_routines_list(&host), Err(RoutinesError::Store));
    db(&lock(&host.0.service)).fail_reads(false);
    db(&lock(&host.0.service)).fail_writes(true);
    assert_eq!(
        run_routine_create(&host, &routine("New")),
        Err(RoutinesError::Store)
    );
    assert_eq!(
        run_routine_add_template(&host, TemplateId::WindDown),
        Err(RoutinesError::Store)
    );
    db(&lock(&host.0.service)).fail_writes(false);
    assert!(changed(&host).is_empty(), "a failed write emits nothing");
    assert_eq!(names(&run_routines_list(&host).unwrap()), ["Kept"]);
}

#[test]
fn a_write_whose_read_back_fails_still_succeeds_without_an_event() {
    let host = host();
    db(&lock(&host.0.service)).fail_reads(true);
    let id = run_routine_create(&host, &routine("Saved"));
    db(&lock(&host.0.service)).fail_reads(false);
    assert!(id.is_ok(), "{id:?}");
    assert!(changed(&host).is_empty());
    let guard = lock(&host.0.service);
    let stored = db(&guard).read(rows::list_live).unwrap();
    assert_eq!(stored[0].fields.name, "Saved");
}

/// Ruling 4: a finished run today reads Finished, an open one InProgress, even with no
/// habit checked in. Runs can already arrive through an import.
#[test]
fn todays_runs_set_the_routine_today() {
    use orasenda_store::routines::routine_runs::{self, NewRun, RunOutcome};
    let host = host();
    let routine_id = run_routine_create(&host, &routine("Morning")).unwrap();
    let step = run_habit_create(&host, Some(&routine_id), &habit("Water")).unwrap();
    run_habit_create(&host, Some(&routine_id), &habit("Walk")).unwrap();
    let today_of = |host: &TestHost| {
        let view = run_routines_list(host).unwrap();
        (view.routines[0].today, view.routines[0].today_line.clone())
    };
    assert_eq!(today_of(&host).0, RoutineToday::NotStarted);
    let run = NewRun {
        id: "run-1".into(),
        routine_id: routine_id.clone(),
        day: "2026-11-07".into(),
        step_ids: vec![step],
    };
    db(&lock(&host.0.service))
        .write(T0, |txn| routine_runs::start(txn, &run))
        .unwrap();
    assert_eq!(
        today_of(&host),
        (RoutineToday::InProgress, "0 of 2 done today".to_owned()),
        "an open run"
    );
    db(&lock(&host.0.service))
        .write(T0, |txn| {
            routine_runs::end(txn, "run-1", RunOutcome::Finished)
        })
        .unwrap();
    assert_eq!(
        today_of(&host),
        (RoutineToday::Finished, "Done today, 0 of 2".to_owned()),
        "a finished run"
    );
}

/// A run stopped early leaves the routine as its habits say.
#[test]
fn a_stopped_run_does_not_finish_the_routine() {
    use orasenda_store::routines::routine_runs::{self, NewRun, RunOutcome};
    let host = host();
    let routine_id = run_routine_create(&host, &routine("Morning")).unwrap();
    let step = run_habit_create(&host, Some(&routine_id), &habit("Water")).unwrap();
    let run = NewRun {
        id: "run-1".into(),
        routine_id,
        day: "2026-11-07".into(),
        step_ids: vec![step],
    };
    db(&lock(&host.0.service))
        .write(T0, |txn| {
            routine_runs::start(txn, &run)?;
            routine_runs::end(txn, "run-1", RunOutcome::Stopped).map(|_| ())
        })
        .unwrap();
    let view = run_routines_list(&host).unwrap();
    assert_eq!(view.routines[0].today, RoutineToday::NotStarted);
}
