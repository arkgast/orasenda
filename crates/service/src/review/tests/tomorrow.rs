//! The shutdown's tomorrow lines: routines, tasks due, planned sessions, this week's priorities.

use orasenda_core::LocalDate;
use orasenda_core::NotificationStatus;
use orasenda_store::reflections::{self, ReflectionKind, ReflectionWrite};

use crate::api::{Lane, RoutineDraft, TaskDraft};
use crate::board::run_task_add;
use crate::routines::{run_routine_create, run_routine_remove};
use crate::session::lock;
use crate::session::test_support::{T0, TestHost};

/// A fresh install, UTC+1. `T0` is Saturday 7 November 2026, 01:00 local.
fn host() -> TestHost {
    TestHost::fresh(NotificationStatus::NotDetermined)
}

/// Saturday 7 November 2026, so tomorrow is Sunday 8 November.
fn saturday() -> LocalDate {
    LocalDate::new(2026, 11, 7).expect("a date")
}

fn lines(host: &TestHost) -> Vec<String> {
    lock(&host.0.service)
        .tomorrow_lines(T0, saturday())
        .expect("the lines")
}

fn routine(host: &TestHost, name: &str, minute: Option<u16>, days: u8) -> String {
    let draft = RoutineDraft {
        name: name.into(),
        time_of_day: minute,
        days,
    };
    run_routine_create(host, &draft).expect("routine saved")
}

fn task(
    host: &TestHost,
    title: &str,
    lane: Lane,
    estimate: Option<u8>,
    due: Option<&str>,
) -> String {
    let draft = TaskDraft {
        title: title.into(),
        lane: Some(lane),
        estimate,
        due: due.map(str::to_owned),
        ..TaskDraft::default()
    };
    run_task_add(host, draft).expect("task added").id
}

#[test]
fn tomorrow_routines_with_times() {
    let host = host();
    // Sunday is bit 64; Saturday (32) is not tomorrow.
    routine(&host, "Evening wind-down", Some(21 * 60), 64);
    routine(&host, "Morning pages", Some(7 * 60 + 30), 127);
    routine(&host, "Saturday only", Some(9 * 60), 32);
    let gone = routine(&host, "Deleted one", Some(8 * 60), 64);
    run_routine_remove(&host, &gone).expect("deleted");
    let got = lines(&host);
    assert_eq!(got[0], "Sunday 8 November.");
    assert_eq!(
        got[1],
        "Routines: Morning pages at 7:30 AM, Evening wind-down at 9:00 PM."
    );
}

#[test]
fn tomorrow_any_time_routines_come_last() {
    let host = host();
    routine(&host, "Stretch", None, 64);
    routine(&host, "Evening wind-down", Some(21 * 60), 64);
    let got = lines(&host);
    assert_eq!(
        got[1],
        "Routines: Evening wind-down at 9:00 PM, Stretch (any time)."
    );
}

#[test]
fn tomorrow_tasks_due() {
    let host = host();
    task(
        &host,
        "Send invoice",
        Lane::Backlog,
        None,
        Some("2026-11-08"),
    );
    task(&host, "Later one", Lane::Backlog, None, Some("2026-11-09"));
    task(&host, "Already done", Lane::Done, None, Some("2026-11-08"));
    let got = lines(&host);
    assert!(got.contains(&"Due: Send invoice.".to_owned()), "{got:?}");
}

#[test]
fn tomorrow_planned_with_buffer() {
    let host = host();
    task(&host, "One", Lane::Today, Some(1), None);
    task(&host, "Two", Lane::Today, Some(1), None);
    task(&host, "Elsewhere", Lane::Doing, Some(5), None);
    let got = lines(&host);
    // Each task rounds up on its own (1 at 25% is 2), so two give 4, not 3.
    let buffer = lock(&host.0.service).settings().board_estimate_buffer;
    assert_eq!(buffer, 25);
    assert!(
        got.contains(&"Planned 4 sessions with a 25% buffer".to_owned()),
        "{got:?}"
    );
}

#[test]
fn tomorrow_uses_current_week_priorities() {
    let host = host();
    let this = task(&host, "This week", Lane::Doing, None, None);
    let next = task(&host, "Next week", Lane::Doing, None, None);
    let write = |period: &str, id: &str| ReflectionWrite {
        kind: ReflectionKind::Week,
        period: period.into(),
        went_well: None,
        to_improve: None,
        outside_control: None,
        improvement: None,
        notes: None,
        priorities: vec![id.into()],
        complete: true,
    };
    let service = lock(&host.0.service);
    let store = service.store().expect("a store");
    // Saturday 7 November belongs to the week of Monday 2 November.
    store
        .write(T0, |txn| {
            reflections::upsert(txn, &write("2026-11-02", &this))
        })
        .expect("saved");
    store
        .write(T0, |txn| {
            reflections::upsert(txn, &write("2026-11-09", &next))
        })
        .expect("saved");
    drop(service);
    let got = lines(&host);
    assert!(
        got.contains(&"Priorities this week: This week.".to_owned()),
        "{got:?}"
    );
}

#[test]
fn tomorrow_empty_day() {
    let host = host();
    assert_eq!(
        lines(&host),
        vec![
            "Sunday 8 November.",
            "No routines scheduled.",
            "Nothing due."
        ]
    );
}
