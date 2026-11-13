//! Window frames: the store calls, the in-memory fallback and the `run_frame_*` functions.

use orasenda_core::NotificationStatus;
use orasenda_store::{OpenError, window_frames};

use super::super::test_support::*;
use super::super::*;
use crate::windows::Frame;

const FRAME: Frame = Frame {
    x: 1040,
    y: 24,
    width: 280,
    height: 64,
};

fn host() -> TestHost {
    TestHost::fresh(NotificationStatus::NotDetermined)
}

fn stored(s: &SessionService, display: &str) -> Option<window_frames::StoredFrame> {
    db(s)
        .read(|txn| window_frames::get(txn, "floater", display))
        .expect("reads")
}

#[test]
fn frame_save_writes_the_store_and_reads_back() {
    let mut s = service();
    s.frame_save("floater", "d1", FRAME, T0);
    assert_eq!(
        stored(&s, "d1"),
        Some(window_frames::StoredFrame {
            x: 1040,
            y: 24,
            width: 280,
            height: 64
        })
    );
    assert!(s.frames.is_empty(), "a saved frame is not kept in memory");
    assert_eq!(s.frame_get("floater", "d1"), Some(FRAME));
    assert_eq!(s.frame_get("floater", "d2"), None);
}

#[test]
fn frame_save_store_down_kept_in_memory() {
    // A write that fails.
    let mut s = service();
    db(&s).fail_writes(true);
    s.frame_save("floater", "d1", FRAME, T0);
    db(&s).fail_writes(false);
    assert_eq!(stored(&s, "d1"), None);
    assert_eq!(s.frame_get("floater", "d1"), Some(FRAME));
    assert_eq!(
        s.frame_load("floater", &["d1"]),
        Some(("d1".to_owned(), FRAME))
    );

    // No store at all.
    let mut degraded = SessionService::new(
        Err(OpenError::Io("no disk".into())),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    degraded.frame_save("floater", "d1", FRAME, T0);
    assert_eq!(degraded.frame_get("floater", "d1"), Some(FRAME));
}

#[test]
fn frame_save_after_a_failed_one_replaces_the_memory_copy() {
    let mut s = service();
    db(&s).fail_writes(true);
    s.frame_save("floater", "d1", FRAME, T0);
    db(&s).fail_writes(false);
    let moved = Frame { x: 8, ..FRAME };
    s.frame_save("floater", "d1", moved, T0 + 1);
    assert_eq!(s.frame_get("floater", "d1"), Some(moved));
    assert!(s.frames.is_empty());
}

#[test]
fn frame_load_picks_the_newest_connected_display() {
    let mut s = service();
    let second = Frame { x: 3, ..FRAME };
    s.frame_save("floater", "old", FRAME, T0);
    s.frame_save("floater", "new", second, T0 + 10);
    s.frame_save("floater", "gone", FRAME, T0 + 20);
    assert_eq!(
        s.frame_load("floater", &["old", "new"]),
        Some(("new".to_owned(), second))
    );
    assert_eq!(s.frame_load("floater", &["nowhere"]), None);
}

#[test]
fn run_frame_functions_use_the_service_and_the_host_clock() {
    let host = host();
    host.set_now(T0 + 5);
    run_frame_save(&host, "floater", "d1", FRAME);
    assert_eq!(run_frame_get(&host, "floater", "d1"), Some(FRAME));
    assert_eq!(
        run_frame_load(&host, "floater", &["d1"]),
        Some(("d1".to_owned(), FRAME))
    );
    // The host's clock stamps the write: a later save on another display is the newest.
    host.set_now(T0 + 9);
    let second = Frame { x: 3, ..FRAME };
    run_frame_save(&host, "floater", "d2", second);
    assert_eq!(
        run_frame_load(&host, "floater", &["d1", "d2"]),
        Some(("d2".to_owned(), second))
    );
}

#[test]
fn legacy_frame_moves_to_new_key_once() {
    let mut s = service();
    s.frame_save("floater", "1-Dell", FRAME, T0);
    s.frame_migrate("floater", &[("1-Dell", "UUID-A")], T0 + 1);
    assert_eq!(stored(&s, "1-Dell"), None, "the legacy row is gone");
    assert_eq!(s.frame_get("floater", "UUID-A"), Some(FRAME));
    assert_eq!(
        s.frame_load("floater", &["UUID-A"]),
        Some(("UUID-A".to_owned(), FRAME))
    );
    // A second pass changes nothing.
    s.frame_migrate("floater", &[("1-Dell", "UUID-A")], T0 + 2);
    assert_eq!(s.frame_get("floater", "UUID-A"), Some(FRAME));
}

#[test]
fn new_key_frame_wins_over_legacy() {
    let mut s = service();
    let newer = Frame { x: 9, ..FRAME };
    s.frame_save("floater", "1-Dell", FRAME, T0);
    s.frame_save("floater", "UUID-A", newer, T0 + 5);
    s.frame_migrate("floater", &[("1-Dell", "UUID-A")], T0 + 6);
    assert_eq!(s.frame_get("floater", "UUID-A"), Some(newer));
    assert_eq!(stored(&s, "1-Dell"), None);
}

#[test]
fn legacy_move_write_failure_keeps_frame_for_run() {
    let mut s = service();
    s.frame_save("floater", "1-Dell", FRAME, T0);
    db(&s).fail_writes(true);
    s.frame_migrate("floater", &[("1-Dell", "UUID-A")], T0 + 1);
    db(&s).fail_writes(false);
    assert_eq!(s.frame_get("floater", "UUID-A"), Some(FRAME));
    assert!(
        stored(&s, "1-Dell").is_some(),
        "the legacy row stays for a retry"
    );
}
