//! The welcome line and the two one-time tips (spec: Hotkeys and capture, Welcome and tips).

use orasenda_core::NotificationStatus;
use orasenda_store::{OpenError, meta};

use super::super::test_support::*;
use super::super::*;
use crate::api::{StoreStatus, TipId, TipSeen};

fn flag(s: &SessionService, key: &str) -> Option<String> {
    db(s).read(|txn| meta::get(txn, key)).expect("reads")
}

/// Runs `count` two-minute sessions to their end, one after another. Returns the time after them.
fn ended(s: &mut SessionService, count: u64) -> u64 {
    let mut at = T0;
    for n in 0..count {
        s.apply(start_quick(), at, id(&format!("q{n}")));
        at += 2 * MINUTE;
        s.tick(at);
        // "Stop here" would clear the offer; the tests only look at the tip.
        at += MINUTE;
    }
    at
}

fn tip_of(s: &SessionService, at: u64) -> Option<TipId> {
    s.view(at).tip
}

fn shown(s: &mut SessionService, tip: TipId, how: TipSeen, at: u64) {
    let effects = s.apply(Action::TipSeen(tip, how), at, id("x"));
    assert!(effects.result.is_ok(), "{:?}", effects.result);
}

#[test]
fn welcome_only_true_first_run() {
    let mut s = service();
    assert!(s.view(T0).welcome, "a fresh device");
    s.apply(start(), T0, id("a"));
    assert!(!s.view(T0 + MINUTE).welcome, "gone at the first Start");
    assert_eq!(flag(&s, "onboard.welcome_done").as_deref(), Some("seen"));
    s.apply(Action::Stop, T0 + 2 * MINUTE, id("x"));
    assert!(!s.view(T0 + 3 * MINUTE).welcome);
    // A relaunch: the flag is there.
    let mut again = relaunch(&mut s, T0 + 4 * MINUTE);
    assert!(!again.view(T0 + 4 * MINUTE).welcome);

    // The flag is absent but the device has rows (a synced history): no welcome.
    db(&again)
        .write(0, |txn| meta::remove(txn, "onboard.welcome_done"))
        .expect("removes");
    let kept = relaunch(&mut again, T0 + 6 * MINUTE);
    assert!(!kept.view(T0 + 6 * MINUTE).welcome, "rows exist");

    // The welcome is idle only, and never while the store can't save.
    let mut running = service();
    running.apply(start(), T0, id("a"));
    assert!(!running.view(T0 + MINUTE).welcome);
    let none = SessionService::new(
        Err(OpenError::Io("no disk".into())),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    assert!(!none.view(T0).welcome);
}

#[test]
fn tip1_after_first_end_variants() {
    let mut s = service();
    s.set_shortcut_usable(true);
    assert_eq!(tip_of(&s, T0), None, "none before a session ends");
    let at = ended(&mut s, 1);
    assert_eq!(tip_of(&s, at), Some(TipId::GlobalShortcut));
    // The shortcut is off or failed, or VoiceOver is on.
    s.set_shortcut_usable(false);
    assert_eq!(tip_of(&s, at), Some(TipId::GlobalShortcutMenu));
    // Only while Today is idle.
    s.apply(start(), at, id("b"));
    assert_eq!(tip_of(&s, at + MINUTE), None);
}

#[test]
fn tip2_after_second_end_variants() {
    let mut s = service();
    s.set_shortcut_usable(true);
    let at = ended(&mut s, 2);
    // Seen tip 1 first: tip 2 is the next one.
    shown(&mut s, TipId::GlobalShortcut, TipSeen::GotIt, at);
    assert_eq!(tip_of(&s, at), Some(TipId::FocusViewKeys), "single keys are on");
    change_settings(&mut s, |settings| settings.single_key = false);
    assert_eq!(tip_of(&s, at), Some(TipId::FocusView));
}

#[test]
fn tip_seen_on_got_it_use_or_second_showing() {
    // Got it.
    let mut s = service();
    s.set_shortcut_usable(true);
    let at = ended(&mut s, 1);
    shown(&mut s, TipId::GlobalShortcut, TipSeen::GotIt, at);
    assert_eq!(tip_of(&s, at), None);
    assert_eq!(flag(&s, "tip.global_shortcut").as_deref(), Some("seen"));

    // The second showing: the first one is counted and the tip stays.
    let mut t = service();
    let at = ended(&mut t, 1);
    shown(&mut t, TipId::GlobalShortcutMenu, TipSeen::Shown, at);
    assert_eq!(tip_of(&t, at), Some(TipId::GlobalShortcutMenu));
    assert_eq!(flag(&t, "tip.global_shortcut").as_deref(), Some("1"));
    shown(&mut t, TipId::GlobalShortcutMenu, TipSeen::Shown, at);
    assert_eq!(tip_of(&t, at), None);
    assert_eq!(flag(&t, "tip.global_shortcut").as_deref(), Some("seen"));

    // Use: ⌃⌥F pressed.
    let mut u = service();
    u.set_shortcut_usable(true);
    let at = ended(&mut u, 1);
    u.apply(Action::StartPauseToggle, at, id("k"));
    u.apply(Action::Stop, at + MINUTE, id("x"));
    assert_eq!(tip_of(&u, at + 2 * MINUTE), None, "⌃⌥F was used");
    assert_eq!(flag(&u, "tip.global_shortcut").as_deref(), Some("seen"));

    // Use: a Focus view opened.
    let mut v = service();
    let at = ended(&mut v, 2);
    shown(&mut v, TipId::GlobalShortcutMenu, TipSeen::GotIt, at);
    assert_eq!(tip_of(&v, at), Some(TipId::FocusViewKeys));
    v.apply(Action::FocusViewOpened, at, id("x"));
    assert_eq!(tip_of(&v, at), None);
    assert!(flag(&v, "used.focus_view").is_some());
    assert_eq!(flag(&v, "tip.focus_view").as_deref(), Some("seen"));

    // Never on Start: a start leaves the flags as they were.
    let mut w = service();
    let at = ended(&mut w, 1);
    w.apply(start(), at, id("n"));
    assert_eq!(flag(&w, "tip.global_shortcut"), None);
    assert_eq!(flag(&w, "tip.focus_view"), None);
}

#[test]
fn no_tip_while_store_unavailable() {
    // No store: no session was ever counted, so there is nothing to tip about.
    let mut none = SessionService::new(
        Err(OpenError::Io("no disk".into())),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    let at = ended(&mut none, 2);
    assert_eq!(tip_of(&none, at), None);

    // The store stops saving: the tip goes, and it is not marked seen.
    let mut s = service();
    let at = ended(&mut s, 1);
    assert_eq!(tip_of(&s, at), Some(TipId::GlobalShortcutMenu));
    db(&s).fail_writes(true);
    shown(&mut s, TipId::GlobalShortcutMenu, TipSeen::Shown, at);
    db(&s).fail_writes(false);
    assert_eq!(s.view(at).store, StoreStatus::Unavailable);
    assert_eq!(tip_of(&s, at), None);
    assert_eq!(flag(&s, "tip.global_shortcut"), None);
}
