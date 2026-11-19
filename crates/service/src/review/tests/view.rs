//! The overview: the primary rule, the shutdown day, the priorities, and the period check.

use orasenda_core::NotificationStatus;
use orasenda_store::reflections::{self, ReflectionKind, ReflectionWrite};

use crate::api::{
    Lane, ReviewError, ReviewPrimary, ReviewView, Settings, TaskDraft, TaskView, WeeklyDay,
};
use crate::board::{run_task_add, run_task_remove};
use crate::review::{check_period, run_review_get};
use crate::session::lock;
use crate::session::test_support::{MINUTE, T0, TestHost};

const HOUR: u64 = 60 * MINUTE;

const DAY: u64 = 24 * HOUR;

/// A fresh install, UTC+1. `T0` is Saturday 7 November 2026, 01:00 local.
fn host() -> TestHost {
    TestHost::fresh(NotificationStatus::NotDetermined)
}

/// Local `hour`:00 on the day `days` after Saturday 7 November 2026.
fn at(days: u64, hour: u64) -> u64 {
    T0 + days * DAY + (hour - 1) * HOUR
}

fn view_at(host: &TestHost, now_ms: u64) -> ReviewView {
    host.set_now(now_ms);
    run_review_get(host).expect("the overview")
}

fn primary_at(host: &TestHost, days: u64) -> ReviewPrimary {
    view_at(host, at(days, 12)).primary
}

fn reflect(host: &TestHost, kind: ReflectionKind, period: &str, priorities: Vec<String>) {
    let write = ReflectionWrite {
        kind,
        period: period.into(),
        went_well: None,
        to_improve: None,
        outside_control: None,
        improvement: None,
        notes: None,
        priorities,
        complete: true,
    };
    lock(&host.0.service)
        .store()
        .expect("a store")
        .write(T0, |txn| reflections::upsert(txn, &write))
        .expect("reflection saved");
}

fn add(host: &TestHost, title: &str, lane: Lane) -> TaskView {
    let draft = TaskDraft {
        title: title.into(),
        lane: Some(lane),
        ..TaskDraft::default()
    };
    run_task_add(host, draft).expect("task added")
}

fn set_weekly_day(host: &TestHost, day: WeeklyDay) {
    let mut service = lock(&host.0.service);
    let mut settings: Settings = service.settings();
    settings.review_weekly_day = day;
    service.set_settings(settings, T0).expect("settings save");
}

#[test]
fn primary_each_weekday() {
    use ReviewPrimary::{Shutdown, Weekly};
    let host = host();
    // Saturday is day 0: Sat, Sun, Mon, Tue, Wed, Thu, Fri.
    let expected = [Weekly, Weekly, Weekly, Shutdown, Shutdown, Shutdown, Weekly];
    for (days, want) in expected.into_iter().enumerate() {
        assert_eq!(primary_at(&host, days as u64), want, "day {days}");
    }
}

#[test]
fn primary_moves_on_when_the_week_is_planned_and_the_shutdown_done() {
    let host = host();
    // Saturday: the planned week starts Monday 9 November.
    reflect(&host, ReflectionKind::Week, "2026-11-09", vec![]);
    assert_eq!(primary_at(&host, 0), ReviewPrimary::Shutdown);
    let view = view_at(&host, at(0, 12));
    assert!(view.week.planned);
    assert_eq!(view.week.line, "Week planned.");
    reflect(&host, ReflectionKind::Shutdown, "2026-11-07", vec![]);
    let view = view_at(&host, at(0, 12));
    assert!(view.today.done);
    assert_eq!(view.primary, ReviewPrimary::None);
}

#[test]
fn primary_with_monday() {
    use ReviewPrimary::{Shutdown, Weekly};
    let host = host();
    set_weekly_day(&host, WeeklyDay::Mon);
    let expected = [
        Shutdown, Shutdown, Weekly, Shutdown, Shutdown, Shutdown, Shutdown,
    ];
    for (days, want) in expected.into_iter().enumerate() {
        assert_eq!(primary_at(&host, days as u64), want, "day {days}");
    }
}

#[test]
fn today_before_four_shows_previous_day() {
    let host = host();
    // Monday 9 November, 02:00 local.
    let early = view_at(&host, at(2, 2));
    assert_eq!(early.today.day, "2026-11-08");
    assert_eq!(early.today.day_label, "Sunday 8 November");
    let later = view_at(&host, at(2, 4));
    assert_eq!(later.today.day, "2026-11-09");
    // The planned week follows the calendar date, not the shutdown day.
    assert_eq!(early.week.week_start, "2026-11-09");
}

#[test]
fn removed_priority_dropped() {
    let host = host();
    let keep = add(&host, "Fix sync bug", Lane::DOING);
    let gone = add(&host, "Old plan", Lane::BACKLOG);
    reflect(
        &host,
        ReflectionKind::Week,
        "2026-11-09",
        vec![keep.id.clone(), gone.id.clone()],
    );
    run_task_remove(&host, &gone.id).expect("removed");
    let view = view_at(&host, at(0, 12));
    let titles: Vec<_> = view
        .week
        .priorities
        .iter()
        .map(|p| p.title.as_str())
        .collect();
    assert_eq!(titles, ["Fix sync bug"]);
    assert_eq!(view.week.priorities[0].line, "Fix sync bug · Doing");
    assert!(!view.week.priorities[0].done);
}

#[test]
fn done_priority_reads_done() {
    let host = host();
    let task = add(&host, "Fix sync bug", Lane::DONE);
    reflect(
        &host,
        ReflectionKind::Week,
        "2026-11-09",
        vec![task.id.clone()],
    );
    let view = view_at(&host, at(0, 12));
    assert_eq!(view.week.priorities[0].line, "Fix sync bug · Done");
    assert!(view.week.priorities[0].done);
    assert_eq!(view.week.priorities[0].task_id, task.id);
}

#[test]
fn unavailable_store_answers_store() {
    let host = host();
    crate::session::test_support::db(&lock(&host.0.service)).fail_reads(true);
    assert_eq!(run_review_get(&host), Err(ReviewError::Store));
}

#[test]
fn period_previous_accepted() {
    // Monday 9 November, 12:00 local (UTC+1).
    let now = at(2, 12);
    for given in ["2026-11-09", "2026-11-08"] {
        assert_eq!(
            check_period(ReflectionKind::Shutdown, given, now, 60),
            Ok(())
        );
    }
    // Monday: the planned week is this week; the one before it is accepted too.
    for given in ["2026-11-09", "2026-11-02"] {
        assert_eq!(check_period(ReflectionKind::Week, given, now, 60), Ok(()));
    }
}

#[test]
fn period_two_back_refused() {
    let now = at(2, 12);
    assert_eq!(
        check_period(ReflectionKind::Shutdown, "2026-11-07", now, 60),
        Err(ReviewError::Period)
    );
    assert_eq!(
        check_period(ReflectionKind::Week, "2026-10-26", now, 60),
        Err(ReviewError::Period)
    );
    assert_eq!(
        check_period(ReflectionKind::Week, "not a date", now, 60),
        Err(ReviewError::Period)
    );
    // Before 04:00 the current shutdown day is still Sunday.
    assert_eq!(
        check_period(ReflectionKind::Shutdown, "2026-11-07", at(2, 2), 60),
        Ok(())
    );
}
