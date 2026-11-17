//! `review-changed` once at local midnight and once at 04:00, from the scheduler tick.

use crate::review::run_review_get;
use crate::scheduler::iterate;
use crate::session::test_support::{Event, MINUTE, T0, TestHost};

const HOUR: u64 = 60 * MINUTE;
use orasenda_core::NotificationStatus;

fn host() -> TestHost {
    TestHost::fresh(NotificationStatus::NotDetermined)
}

fn count(host: &TestHost) -> usize {
    host.log()
        .take()
        .iter()
        .filter(|event| matches!(event, Event::ReviewChanged(_)))
        .count()
}

fn under_lock(host: &TestHost) -> usize {
    host.0.under_lock.load(std::sync::atomic::Ordering::SeqCst)
}

#[test]
fn emit_at_midnight_once() {
    let host = host();
    // T0 is 01:00 local on Saturday; 12:00 first, so only the day is recorded.
    host.set_now(T0 + 11 * HOUR);
    iterate(&host);
    host.log().take();
    host.set_now(T0 + 22 * HOUR + 59 * MINUTE);
    iterate(&host);
    assert_eq!(count(&host), 0, "none within the day");
    // 00:00 local on Sunday.
    host.set_now(T0 + 23 * HOUR);
    iterate(&host);
    assert_eq!(count(&host), 1);
    host.set_now(T0 + 23 * HOUR + MINUTE);
    iterate(&host);
    assert_eq!(count(&host), 0, "once per day");
}

#[test]
fn emit_at_four_once() {
    let host = host();
    iterate(&host);
    host.log().take();
    // 03:59 local on Saturday, then 04:00.
    host.set_now(T0 + 2 * HOUR + 59 * MINUTE);
    iterate(&host);
    assert_eq!(count(&host), 0);
    host.set_now(T0 + 3 * HOUR);
    iterate(&host);
    let events = host.log().take();
    let views: Vec<_> = events
        .iter()
        .filter_map(|event| match event {
            Event::ReviewChanged(view) => Some(view),
            _ => None,
        })
        .collect();
    assert_eq!(views.len(), 1);
    assert_eq!(
        views[0].today.day, "2026-11-07",
        "the shutdown day moved on"
    );
    host.set_now(T0 + 3 * HOUR + MINUTE);
    iterate(&host);
    assert_eq!(count(&host), 0, "once");
}

#[test]
fn emit_after_unlock() {
    let host = host();
    iterate(&host);
    host.set_now(T0 + 3 * HOUR);
    iterate(&host);
    assert_eq!(under_lock(&host), 0);
    assert!(run_review_get(&host).is_ok());
}

#[test]
fn a_failed_read_retries_on_the_next_tick() {
    let host = host();
    iterate(&host);
    host.log().take();
    crate::session::test_support::db(&crate::session::lock(&host.0.service)).fail_reads(true);
    host.set_now(T0 + 3 * HOUR);
    iterate(&host);
    crate::session::test_support::db(&crate::session::lock(&host.0.service)).fail_reads(false);
    assert_eq!(count(&host), 0);
    host.set_now(T0 + 3 * HOUR + MINUTE);
    iterate(&host);
    assert_eq!(count(&host), 1, "the change is not lost");
}
