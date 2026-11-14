//! The full-screen key hints counter.

use orasenda_core::NotificationStatus;
use orasenda_store::{OpenError, meta};

use super::super::test_support::*;
use super::super::*;

const KEY: &str = "hint.full_screen_keys";

fn stored(s: &SessionService) -> Option<String> {
    db(s).read(|txn| meta::get(txn, KEY)).expect("reads")
}

#[test]
fn hint_bumped_on_did_enter_only_under_3() {
    let mut s = service();
    assert_eq!(s.full_screen_hints_left(), 3, "a fresh device");
    for (entry, before, after) in [(1, 3, "1"), (2, 2, "2"), (3, 1, "3")] {
        assert_eq!(s.note_full_screen_entered(T0), before, "entry {entry}");
        assert_eq!(stored(&s).as_deref(), Some(after));
    }
    assert_eq!(s.full_screen_hints_left(), 0);
    // The fourth entry shows nothing and writes nothing.
    assert_eq!(s.note_full_screen_entered(T0), 0);
    assert_eq!(stored(&s).as_deref(), Some("3"));
}

#[test]
fn hint_counter_device_only_no_change_log() {
    let mut s = service();
    let rows = db(&s).change_log_ids().len();
    s.note_full_screen_entered(T0);
    s.note_full_screen_entered(T0 + MINUTE);
    assert_eq!(stored(&s).as_deref(), Some("2"));
    assert_eq!(db(&s).change_log_ids().len(), rows, "no change_log row");
}

#[test]
fn hint_counter_bad_value_reads_as_done() {
    for bad in ["4", "x", "-1", ""] {
        let mut s = service();
        db(&s)
            .write(0, |txn| meta::set(txn, KEY, bad))
            .expect("writes");
        assert_eq!(s.full_screen_hints_left(), 0, "{bad:?}");
        assert_eq!(s.note_full_screen_entered(T0), 0, "{bad:?}");
        assert_eq!(stored(&s).as_deref(), Some(bad), "left as it was");
    }
}

#[test]
fn hint_counter_survives_a_relaunch() {
    let mut s = service();
    s.note_full_screen_entered(T0);
    let again = relaunch(&mut s, T0 + MINUTE);
    assert_eq!(again.full_screen_hints_left(), 2);
}

#[test]
fn hint_counter_without_a_store_shows_nothing() {
    let mut s = SessionService::new(
        Err(OpenError::Io("no store".into())),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    assert_eq!(s.full_screen_hints_left(), 0);
    assert_eq!(s.note_full_screen_entered(T0), 0);
}
