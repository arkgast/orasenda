//! The buffer suggestion: the threshold, the check against the Board's setting, and *Not now*.

use super::support::*;
use crate::api::{ReviewError, StatsRange};
use crate::review::{run_buffer_suggestion_dismiss, run_review_stats};
use crate::session::lock;
use crate::session::test_support::{T0, TestHost, db};

fn suggestion(host: &TestHost) -> Option<crate::api::BufferSuggestionView> {
    run_review_stats(host, StatsRange::Week)
        .expect("stats")
        .buffer
}

#[test]
fn buffer_shows_over_the_threshold() {
    let host = host();
    ten_tasks(&host);
    let shown = suggestion(&host).expect("a suggestion");
    assert_eq!(shown.percent, 50);
    assert_eq!(shown.action, "Use 50%");
    assert_eq!(
        shown.line,
        "10 finished tasks: 20 sessions planned, 30 sessions of 5 minutes or more. A 50% buffer would fit these."
    );
    // The same on every range.
    assert!(
        run_review_stats(&host, StatsRange::Months6)
            .unwrap()
            .buffer
            .is_some()
    );
}

#[test]
fn buffer_hidden_under_threshold() {
    let host = host();
    for n in 0..9u64 {
        done_task(&host, &format!("t{n}"), n * 3, Some(2), 3);
    }
    assert_eq!(suggestion(&host), None);
}

#[test]
fn buffer_hidden_when_equal_to_current() {
    let host = host();
    ten_tasks(&host);
    settings(&host, |s| s.board_estimate_buffer = 50);
    assert_eq!(suggestion(&host), None);
    settings(&host, |s| s.board_estimate_buffer = 45);
    assert!(suggestion(&host).is_some(), "a different value shows");
}

#[test]
fn dismiss_hides_28_days() {
    let host = host();
    ten_tasks(&host);
    assert!(suggestion(&host).is_some());
    run_buffer_suggestion_dismiss(&host).expect("dismisses");
    assert_eq!(suggestion(&host), None);
    host.set_now(T0 + 27 * DAY + 23 * HOUR);
    assert_eq!(suggestion(&host), None);
    // Nothing here changed the buffer.
    assert_eq!(lock(&host.0.service).settings().board_estimate_buffer, 25);
}

#[test]
fn dismiss_expires_after_28_days() {
    let host = host();
    ten_tasks(&host);
    run_buffer_suggestion_dismiss(&host).expect("dismisses");
    host.set_now(T0 + 28 * DAY);
    assert!(suggestion(&host).is_some());
}

#[test]
fn dismiss_is_device_only_meta() {
    let host = host();
    run_buffer_suggestion_dismiss(&host).expect("dismisses");
    let service = lock(&host.0.service);
    let stored = db(&service)
        .read(|txn| orasenda_store::meta::get(txn, "hint.buffer_suggestion"))
        .expect("reads");
    assert_eq!(stored, Some(T0.to_string()));
}

#[test]
fn dismiss_with_a_failing_write_answers_store() {
    let host = host();
    db(&lock(&host.0.service)).fail_writes(true);
    assert_eq!(
        run_buffer_suggestion_dismiss(&host),
        Err(ReviewError::Store)
    );
}

#[test]
fn dismiss_leaves_no_change_log_rows() {
    let host = host();
    let before = db(&lock(&host.0.service)).change_log_ids();
    run_buffer_suggestion_dismiss(&host).expect("dismisses");
    assert_eq!(db(&lock(&host.0.service)).change_log_ids(), before);
}
