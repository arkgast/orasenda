//! The keep-going hint.

use orasenda_core::NotificationStatus;
use orasenda_store::meta;

use super::super::test_support::*;
use super::super::*;
use crate::api::{Hint, Settings};

fn stored(s: &SessionService) -> Option<String> {
    db(s)
        .read(|txn| meta::get(txn, "hint.keep_going"))
        .expect("reads")
}

/// Starts a focus and takes a manual "+10 min" from the warning.
fn extended(s: &mut SessionService) -> Option<Hint> {
    numbered_break_ids(s);
    s.apply(start(), T0, id("a"));
    s.tick(T0 + 23 * MINUTE);
    s.apply(Action::Extend, T0 + 24 * MINUTE, id("x")).view.hint
}

fn auto_on(s: &mut SessionService) {
    let on = Settings {
        auto_continue: true,
        ..s.settings()
    };
    s.set_settings(on, T0).expect("saves");
}

#[test]
fn manual_extend_sets_keep_going_hint() {
    let mut s = service();
    assert_eq!(extended(&mut s), Some(Hint::KeepGoing));
    // From a break with an open focus too.
    let mut b = service();
    numbered_break_ids(&mut b);
    b.apply(start(), T0, id("a"));
    b.tick(T0 + 25 * MINUTE);
    let back = b.apply(Action::Extend, T0 + 26 * MINUTE, id("x"));
    assert_eq!(back.view.hint, Some(Hint::KeepGoing));
}

#[test]
fn auto_step_does_not_set_hint() {
    let mut s = service();
    auto_on(&mut s);
    s.apply(start(), T0, id("a"));
    for minute in [20, 24, 26, 30, 40] {
        assert_eq!(s.tick(T0 + minute * MINUTE).view.hint, None);
    }
}

#[test]
fn auto_continue_on_does_not_set_hint() {
    let mut s = service();
    auto_on(&mut s);
    numbered_break_ids(&mut s);
    s.apply(start(), T0, id("a"));
    s.tick(T0 + 23 * MINUTE);
    let effects = s.apply(Action::Extend, T0 + 24 * MINUTE, id("x"));
    assert_eq!(effects.view.hint, None);
}

#[test]
fn hint_shown_writes_meta_and_clears() {
    let mut s = service();
    assert_eq!(extended(&mut s), Some(Hint::KeepGoing));
    let shown = s.apply(
        Action::HintShown(Hint::KeepGoing),
        T0 + 25 * MINUTE,
        id("x"),
    );
    assert!(shown.result.is_ok());
    assert_eq!(shown.view.hint, None);
    let stamp = stored(&s).expect("written");
    assert!(
        stamp.starts_with("2026-") && stamp.ends_with('Z'),
        "{stamp}"
    );
    // No later extend sets it again, from the break either.
    s.tick(T0 + 35 * MINUTE);
    let again = s.apply(Action::Extend, T0 + 36 * MINUTE, id("x"));
    assert_eq!(again.view.hint, None);
}

#[test]
fn hint_not_set_after_meta_written() {
    let store = seeded_store();
    store.put_meta_for_tests("hint.keep_going", "2026-01-01T00:00:00Z");
    let mut s = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    assert_eq!(extended(&mut s), None);
}

#[test]
fn hint_clears_at_focus_end() {
    let mut s = service();
    assert_eq!(extended(&mut s), Some(Hint::KeepGoing));
    let stopped = s.apply(Action::Stop, T0 + 25 * MINUTE, id("x"));
    assert_eq!(stopped.view.hint, None);

    let mut n = service();
    assert_eq!(extended(&mut n), Some(Hint::KeepGoing));
    assert_eq!(
        n.tick(T0 + 36 * MINUTE).view.hint,
        None,
        "the focus completed"
    );
}

#[test]
fn hint_clears_when_auto_continue_turns_on() {
    let mut s = service();
    assert_eq!(extended(&mut s), Some(Hint::KeepGoing));
    auto_on(&mut s);
    assert_eq!(s.view(T0 + 25 * MINUTE).hint, None);
    let off = Settings {
        auto_continue: false,
        ..s.settings()
    };
    s.set_settings(off, T0 + 26 * MINUTE).expect("saves");
    assert_eq!(s.view(T0 + 27 * MINUTE).hint, None, "it does not come back");
}

#[test]
fn hint_startup_read_failure_means_no_hint() {
    let store = seeded_store();
    store.fail_reads(true);
    let platform = fakes(NotificationStatus::NotDetermined, false).platform;
    let mut s = SessionService::new(Ok(store), platform, T0);
    db(&s).fail_reads(false);
    assert_eq!(extended(&mut s), None);
}

#[test]
fn hint_write_failure_clears_for_run() {
    let mut s = service();
    assert_eq!(extended(&mut s), Some(Hint::KeepGoing));
    db(&s).fail_writes(true);
    let shown = s.apply(
        Action::HintShown(Hint::KeepGoing),
        T0 + 25 * MINUTE,
        id("x"),
    );
    db(&s).fail_writes(false);
    assert_eq!(shown.view.hint, None);
    assert_eq!(stored(&s), None);
    s.tick(T0 + 35 * MINUTE);
    let again = s.apply(Action::Extend, T0 + 36 * MINUTE, id("x"));
    assert_eq!(again.view.hint, None, "hidden for the rest of this run");
}
