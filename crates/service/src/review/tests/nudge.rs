//! The shutdown and weekly nudges: the preferences, the status, the window, once a day, the
//! weekdays, completion, and the two ways a nudge gives way.

use orasenda_core::NotificationStatus;
use orasenda_store::reflections::{self, ReflectionKind, ReflectionWrite};

use crate::api::{RoutineDraft, Settings};
use crate::review::nudge_due;
use crate::routines::run_routine_create;
use crate::scheduler::iterate;
use crate::session::lock;
use crate::session::test_support::{Event, MINUTE, T0, TestHost};

const DAY: u64 = 24 * 60 * MINUTE;
const SHUTDOWN: &str = "Ready to close the day when you are.";
const WEEKLY: &str = "Your weekly review is ready when you are.";

/// Local `minute` of the day `days` after Saturday 7 November 2026 (`T0` is 01:00 local).
fn at(days: u64, minute: u64) -> u64 {
    T0 + days * DAY + (minute - 60) * MINUTE
}

/// The default shutdown time, 17:30.
const NOW: u64 = 1050;

/// Monday 9 November, 17:30: a weekday that is not the weekly day.
fn monday() -> u64 {
    at(2, NOW)
}

/// Friday 13 November, 17:30: the shutdown and the weekly review are both due.
fn friday() -> u64 {
    at(6, NOW)
}

fn host(shutdown: bool, weekly: bool, status: NotificationStatus) -> TestHost {
    let host = TestHost::fresh(status);
    let mut service = lock(&host.0.service);
    let settings = Settings {
        notify_shutdown_due: shutdown,
        notify_weekly_review: weekly,
        ..service.settings()
    };
    service.set_settings(settings, T0).expect("saves");
    drop(service);
    host.log().take();
    host
}

fn granted(shutdown: bool, weekly: bool) -> TestHost {
    host(shutdown, weekly, NotificationStatus::Granted)
}

fn tick(host: &TestHost, at: u64) {
    host.set_now(at);
    nudge_due(host, false);
}

fn posts(host: &TestHost) -> Vec<String> {
    host.log()
        .take()
        .into_iter()
        .filter_map(|event| match event {
            Event::Posted(title, _) => Some(title),
            _ => None,
        })
        .collect()
}

fn complete(host: &TestHost, kind: ReflectionKind, period: &str) {
    let write = ReflectionWrite {
        kind,
        period: period.into(),
        went_well: None,
        to_improve: None,
        outside_control: None,
        improvement: None,
        notes: None,
        priorities: Vec::new(),
        complete: true,
    };
    lock(&host.0.service)
        .store()
        .expect("a store")
        .write(T0, |txn| reflections::upsert(txn, &write))
        .expect("reflection saved");
}

#[test]
fn nudge_off_by_default() {
    assert!(!Settings::default().notify_shutdown_due);
    assert!(!Settings::default().notify_weekly_review);
    let host = granted(false, false);
    tick(&host, friday());
    assert!(posts(&host).is_empty());
    assert_eq!(host.log().count(|e| matches!(e, Event::StatusRead)), 0);
}

#[test]
fn nudge_denied_posts_nothing() {
    for status in [
        NotificationStatus::Denied,
        NotificationStatus::NotDetermined,
        NotificationStatus::Unavailable,
    ] {
        let host = host(true, true, status);
        tick(&host, friday());
        assert!(posts(&host).is_empty(), "{status:?}");
    }
    // Allowed later inside the window: the next minute posts.
    let host = host(true, false, NotificationStatus::Denied);
    tick(&host, monday());
    host.0.notifier.set_status(NotificationStatus::Granted);
    tick(&host, monday() + MINUTE);
    assert_eq!(posts(&host), vec![SHUTDOWN]);
}

#[test]
fn nudge_inside_30_minute_window() {
    for offset in [0, 29] {
        let host = granted(true, false);
        tick(&host, monday() + offset * MINUTE);
        assert_eq!(posts(&host), vec![SHUTDOWN], "+{offset}");
    }
    let host = granted(false, true);
    tick(&host, friday() + 29 * MINUTE);
    assert_eq!(posts(&host), vec![WEEKLY]);
}

#[test]
fn nudge_not_after_window() {
    let host = granted(true, true);
    tick(&host, monday() - MINUTE);
    tick(&host, monday() + 30 * MINUTE);
    tick(&host, friday() + 30 * MINUTE);
    assert!(posts(&host).is_empty());
}

#[test]
fn nudge_once_per_day() {
    let host = granted(true, false);
    for offset in [0, 1, 2, 29] {
        tick(&host, monday() + offset * MINUTE);
    }
    assert_eq!(posts(&host), vec![SHUTDOWN]);
    tick(&host, monday() + DAY);
    assert_eq!(posts(&host), vec![SHUTDOWN], "the next day it is due again");
}

#[test]
fn nudge_minute_gate() {
    let host = host(true, true, NotificationStatus::Denied);
    tick(&host, monday());
    tick(&host, monday() + 1_000);
    tick(&host, monday() + 2_000);
    let reads = host.log().count(|e| matches!(e, Event::StatusRead));
    assert_eq!(reads, 1, "the status is read once in the minute");
}

#[test]
fn nudge_skipped_when_complete() {
    let host = granted(true, false);
    complete(&host, ReflectionKind::Shutdown, "2026-11-09");
    tick(&host, monday());
    assert!(posts(&host).is_empty(), "today's shutdown is complete");

    let host = granted(false, true);
    complete(&host, ReflectionKind::Week, "2026-11-16");
    tick(&host, friday());
    assert!(posts(&host).is_empty(), "the planned week is complete");
}

#[test]
fn weekly_wins_marks_shutdown_nudged() {
    let host = granted(true, true);
    tick(&host, friday());
    assert_eq!(posts(&host), vec![WEEKLY]);
    for offset in 1..30 {
        tick(&host, friday() + offset * MINUTE);
    }
    assert!(posts(&host).is_empty(), "the shutdown does not follow");
}

#[test]
fn routine_nudge_same_minute_marks_review_nudged() {
    let host = granted(true, false);
    let routine = RoutineDraft {
        name: "Evening".into(),
        time_of_day: Some(1050),
        days: 127,
    };
    run_routine_create(&host, &routine).expect("routine");
    let mut service = lock(&host.0.service);
    let settings = Settings {
        notify_routine_due: true,
        ..service.settings()
    };
    service.set_settings(settings, T0).expect("saves");
    drop(service);
    host.log().take();
    host.set_now(monday());
    iterate(&host);
    assert_eq!(posts(&host), vec!["Evening is ready when you are."]);
    for offset in 1..30 {
        host.set_now(monday() + offset * MINUTE);
        iterate(&host);
    }
    assert!(
        posts(&host).is_empty(),
        "the review nudge is not posted later"
    );
}

#[test]
fn shutdown_nudge_weekdays_only() {
    let host = granted(true, false);
    tick(&host, at(0, NOW));
    tick(&host, at(1, NOW));
    assert!(posts(&host).is_empty(), "Saturday and Sunday");
    for days in 2..=6 {
        tick(&host, at(days, NOW));
    }
    assert_eq!(posts(&host).len(), 5, "Monday to Friday");
}

#[test]
fn weekly_nudge_on_the_weekly_day_only() {
    let host = granted(false, true);
    tick(&host, monday());
    assert!(posts(&host).is_empty());
}
