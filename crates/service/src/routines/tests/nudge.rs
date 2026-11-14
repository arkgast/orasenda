//! The due nudge through the scheduler tick: the preference, the status, the window, once a
//! day, finished routines and *Any time*.

use orasenda_core::NotificationStatus;

use super::super::*;
use super::*;
use crate::api::{Settings, StepOutcome};
use crate::scheduler::iterate;
use crate::session::lock;
use crate::session::test_support::{MINUTE, T0};

/// 07:00 local on Saturday 7 November (T0 is 01:00 local).
const SEVEN: u64 = T0 + 6 * HOUR;

/// A granted host with a 07:00 routine "Morning" (one habit), the nudge on or off.
fn nudge_host(on: bool, status: NotificationStatus) -> (TestHost, String) {
    let host = TestHost::fresh(status);
    let r = run_routine_create(&host, &routine("Morning")).unwrap();
    run_habit_create(&host, Some(&r), &habit("Water")).unwrap();
    set_nudge(&host, on);
    host.log().take();
    (host, r)
}

fn set_nudge(host: &TestHost, on: bool) {
    let mut service = lock(&host.0.service);
    let settings = Settings {
        notify_routine_due: on,
        ..service.settings()
    };
    service.set_settings(settings, T0).expect("saves");
}

fn posts(host: &TestHost) -> Vec<(String, String)> {
    host.log()
        .take()
        .into_iter()
        .filter_map(|event| match event {
            Event::Posted(title, body) => Some((title, body)),
            _ => None,
        })
        .collect()
}

fn tick_at(host: &TestHost, at: u64) {
    host.set_now(at);
    iterate(host);
}

#[test]
fn the_nudge_is_off_by_default() {
    assert!(!Settings::default().notify_routine_due);
    let (host, _) = nudge_host(false, NotificationStatus::Granted);
    tick_at(&host, SEVEN);
    assert!(posts(&host).is_empty());
}

#[test]
fn the_nudge_posts_once_at_the_routines_time() {
    let (host, _) = nudge_host(true, NotificationStatus::Granted);
    tick_at(&host, SEVEN - MINUTE);
    assert!(posts(&host).is_empty(), "not before its time");
    tick_at(&host, SEVEN);
    assert_eq!(
        posts(&host),
        vec![("Morning is ready when you are.".to_owned(), String::new())]
    );
    assert_eq!(under_lock(&host), 0);
    for at in [SEVEN + 1_000, SEVEN + MINUTE, SEVEN + 29 * MINUTE] {
        tick_at(&host, at);
    }
    assert!(posts(&host).is_empty(), "once per day");
    // The next day it is due again.
    tick_at(&host, SEVEN + DAY);
    assert_eq!(posts(&host).len(), 1);
}

#[test]
fn the_nudge_works_once_per_new_minute() {
    let (host, _) = nudge_host(true, NotificationStatus::Denied);
    tick_at(&host, SEVEN);
    tick_at(&host, SEVEN + 1_000);
    tick_at(&host, SEVEN + 2_000);
    let reads = host.log().count(|event| matches!(event, Event::StatusRead));
    assert_eq!(reads, 1, "the status is read once in the minute");
}

#[test]
fn the_nudge_needs_a_granted_status_read_before_posting() {
    for status in [
        NotificationStatus::Denied,
        NotificationStatus::NotDetermined,
        NotificationStatus::Unavailable,
    ] {
        let (host, _) = nudge_host(true, status);
        tick_at(&host, SEVEN);
        assert!(posts(&host).is_empty(), "{status:?}");
    }
    // Allowed later inside the window: the next minute posts.
    let (host, _) = nudge_host(true, NotificationStatus::Denied);
    tick_at(&host, SEVEN);
    host.0.notifier.set_status(NotificationStatus::Granted);
    tick_at(&host, SEVEN + MINUTE);
    assert_eq!(posts(&host).len(), 1);
}

#[test]
fn the_grace_window_is_thirty_minutes() {
    let (host, _) = nudge_host(true, NotificationStatus::Granted);
    tick_at(&host, SEVEN + 29 * MINUTE);
    assert_eq!(posts(&host).len(), 1, "inside the window");
    let (late, _) = nudge_host(true, NotificationStatus::Granted);
    tick_at(&late, SEVEN + 30 * MINUTE);
    assert!(posts(&late).is_empty(), "past the window");
}

#[test]
fn a_finished_routine_is_never_nudged() {
    let (host, r) = nudge_host(true, NotificationStatus::Granted);
    host.set_now(SEVEN - HOUR);
    let run = run_run_start(&host, &r).unwrap();
    run_run_step(&host, &run.id, StepOutcome::Done).unwrap();
    host.log().take();
    tick_at(&host, SEVEN);
    assert!(posts(&host).is_empty());
}

#[test]
fn a_routine_with_an_open_run_is_not_nudged() {
    let (host, r) = nudge_host(true, NotificationStatus::Granted);
    run_habit_create(&host, Some(&r), &habit("Stretch")).unwrap();
    host.set_now(SEVEN - HOUR);
    let run = run_run_start(&host, &r).unwrap();
    run_run_step(&host, &run.id, StepOutcome::Done).unwrap();
    host.log().take();
    tick_at(&host, SEVEN);
    assert!(posts(&host).is_empty(), "the person is already doing it");
}

#[test]
fn any_time_and_off_days_are_never_nudged() {
    let host = TestHost::fresh(NotificationStatus::Granted);
    let mut any = routine("Whenever");
    any.time_of_day = None;
    run_routine_create(&host, &any).unwrap();
    // Saturday 7 November is not a weekday.
    let mut weekdays = routine("Desk");
    weekdays.days = 31;
    run_routine_create(&host, &weekdays).unwrap();
    set_nudge(&host, true);
    host.log().take();
    for minute in 0..30 {
        tick_at(&host, SEVEN + minute * MINUTE);
    }
    assert!(posts(&host).is_empty());
}

#[test]
fn two_routines_due_together_post_one_each() {
    let (host, _) = nudge_host(true, NotificationStatus::Granted);
    run_routine_create(&host, &routine("Second")).unwrap();
    host.log().take();
    tick_at(&host, SEVEN);
    let titles: Vec<String> = posts(&host).into_iter().map(|(title, _)| title).collect();
    assert_eq!(
        titles,
        vec![
            "Morning is ready when you are.".to_owned(),
            "Second is ready when you are.".to_owned()
        ]
    );
}

#[test]
fn a_failed_read_posts_nothing_and_the_next_minute_tries_again() {
    let (host, _) = nudge_host(true, NotificationStatus::Granted);
    crate::session::test_support::db(&lock(&host.0.service)).fail_reads(true);
    tick_at(&host, SEVEN);
    crate::session::test_support::db(&lock(&host.0.service)).fail_reads(false);
    assert!(posts(&host).is_empty());
    tick_at(&host, SEVEN + MINUTE);
    assert_eq!(posts(&host).len(), 1);
}

#[test]
fn the_setting_is_saved_under_its_key() {
    let (host, _) = nudge_host(true, NotificationStatus::Granted);
    let stored = crate::session::test_support::db(&lock(&host.0.service))
        .read(|txn| orasenda_store::settings::get::<bool>(txn, "notify.routine_due"))
        .unwrap();
    assert_eq!(stored, Some(true));
}
