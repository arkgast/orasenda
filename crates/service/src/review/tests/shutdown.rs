//! `shutdown_get` and `shutdown_complete`: the frozen day, trimmed answers, one row, and the
//! period check.

use orasenda_store::reflections::{self, ReflectionKind, reflection_id};

use super::support::{HOUR, host};
use crate::api::{Lane, ReviewError, ShutdownAnswers, ShutdownView, TaskDraft};
use crate::board::{run_board_get, run_task_add};
use crate::review::{run_shutdown_complete, run_shutdown_get};
use crate::session::lock;
use crate::session::test_support::{Event, T0, TestHost};

/// Saturday 7 November 2026, 13:00 local: the shutdown day is that same date.
const NOON: u64 = T0 + 12 * HOUR;
const DAY: &str = "2026-11-07";

pub(super) fn add(host: &TestHost, title: &str, lane: Lane) -> String {
    let draft = TaskDraft {
        title: title.into(),
        lane: Some(lane),
        ..TaskDraft::default()
    };
    run_task_add(host, draft).expect("task added").id
}

pub(super) fn lane_of(host: &TestHost, id: &str) -> Lane {
    run_board_get(host)
        .expect("the board")
        .columns
        .into_iter()
        .find(|column| column.tasks.iter().any(|task| task.id == id))
        .map(|column| column.lane)
        .expect("the task is on the board")
}

fn answers(went_well: Option<&str>) -> ShutdownAnswers {
    ShutdownAnswers {
        went_well: went_well.map(str::to_owned),
        ..ShutdownAnswers::default()
    }
}

fn rows(host: &TestHost) -> Vec<reflections::ReflectionRow> {
    lock(&host.0.service)
        .store()
        .expect("a store")
        .read(|txn| reflections::list(txn, ReflectionKind::Shutdown, "0000-00-00", "9999-99-99"))
        .expect("reads")
}

fn view_at(host: &TestHost, now_ms: u64) -> ShutdownView {
    host.set_now(now_ms);
    run_shutdown_get(host).expect("the shutdown")
}

#[test]
fn shutdown_get_lists_today_and_doing_and_freezes_the_day() {
    let host = host();
    let a = add(&host, "Write", Lane::TODAY);
    let b = add(&host, "Read", Lane::DOING);
    add(&host, "Later", Lane::BACKLOG);
    let view = view_at(&host, NOON);
    assert_eq!(view.day, DAY);
    assert_eq!(view.day_label, "Saturday 7 November");
    let listed: Vec<_> = view
        .unfinished
        .iter()
        .map(|task| (task.id.as_str(), task.lane_label.as_str(), task.active))
        .collect();
    assert_eq!(
        listed,
        [(a.as_str(), "Today", false), (b.as_str(), "Doing", false)]
    );
    assert!(!view.tomorrow.is_empty());
    assert_eq!(view.completed_line, None);
    // Before 04:00 the day is still the previous date.
    assert_eq!(view_at(&host, T0).day, "2026-11-06");
}

#[test]
fn shutdown_complete_writes_one_row() {
    let host = host();
    host.set_now(NOON);
    let view = run_shutdown_complete(&host, DAY, answers(Some("  A calm day  "))).expect("saves");
    assert_eq!(view.answers.went_well.as_deref(), Some("A calm day"));
    assert_eq!(view.completed_line.as_deref(), Some("Shutdown complete."));
    let rows = rows(&host);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].id, reflection_id(ReflectionKind::Shutdown, DAY));
    assert_eq!(rows[0].went_well.as_deref(), Some("A calm day"));
    assert_eq!(rows[0].completed_at, Some(NOON));
}

#[test]
fn complete_again_keeps_first_completed_at() {
    let host = host();
    host.set_now(NOON);
    run_shutdown_complete(&host, DAY, answers(Some("one"))).expect("saves");
    host.set_now(NOON + HOUR);
    run_shutdown_complete(&host, DAY, answers(Some("two"))).expect("saves again");
    let rows = rows(&host);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].completed_at, Some(NOON));
    assert_eq!(rows[0].went_well.as_deref(), Some("two"));
}

#[test]
fn complete_emits_review_changed_after_unlock() {
    let host = host();
    host.set_now(NOON);
    host.log().take();
    run_shutdown_complete(&host, DAY, answers(None)).expect("saves");
    let events = host.log().take();
    let changed: Vec<_> = events
        .iter()
        .filter_map(|event| match event {
            Event::ReviewChanged(view) => Some(view),
            _ => None,
        })
        .collect();
    assert_eq!(changed.len(), 1);
    assert!(changed[0].today.done);
    assert_eq!(
        host.0.under_lock.load(std::sync::atomic::Ordering::SeqCst),
        0
    );
}

#[test]
fn absent_answer_writes_null() {
    let host = host();
    host.set_now(NOON);
    let all = ShutdownAnswers {
        went_well: Some("   ".into()),
        to_improve: None,
        outside_control: Some("Rain".into()),
    };
    let view = run_shutdown_complete(&host, DAY, all).expect("saves");
    assert_eq!(view.answers.went_well, None);
    let rows = rows(&host);
    assert_eq!(rows[0].went_well, None);
    assert_eq!(rows[0].to_improve, None);
    assert_eq!(rows[0].outside_control.as_deref(), Some("Rain"));
}

#[test]
fn too_long_refused() {
    let host = host();
    host.set_now(NOON);
    let long = "a".repeat(1_001);
    assert_eq!(
        run_shutdown_complete(&host, DAY, answers(Some(&long))),
        Err(ReviewError::TooLong)
    );
    assert!(rows(&host).is_empty());
    let exact = "é".repeat(1_000);
    assert!(run_shutdown_complete(&host, DAY, answers(Some(&exact))).is_ok());
}

#[test]
fn period_two_back_refused() {
    let host = host();
    host.set_now(NOON);
    // The day before is accepted; two back is not.
    let view = run_shutdown_complete(&host, "2026-11-06", answers(None)).expect("accepted");
    assert_eq!(view.day, "2026-11-06");
    assert_eq!(view.completed_line.as_deref(), Some("Shutdown complete."));
    assert_eq!(
        run_shutdown_complete(&host, "2026-11-05", answers(None)),
        Err(ReviewError::Period)
    );
    assert_eq!(rows(&host).len(), 1);
}
