//! `set_binding` and `restore_default`: the order of the checks, the refusals, and the fold,
//! repair and register path at launch (ADR-020).

use orasenda_core::NotificationStatus;
use orasenda_store::{OpenError, settings};

use std::sync::Arc;

use super::cases::{CAPTURE, FLOATER, START, global, rig, stored, view};
use super::*;
use crate::api::{KeyboardError, ShortcutStatus};
use crate::scheduler::Host;
use crate::session::SessionService;
use crate::session::lock;
use crate::session::test_support::*;

fn set(
    r: &super::cases::Rig,
    id: ActionId,
    slot: Slot,
    keys: &str,
    confirm: bool,
) -> Result<crate::api::KeyboardView, KeyboardError> {
    r.kb.set_binding(&r.host, id, slot, Some(keys.into()), confirm)
}

fn nothing_changed(r: &super::cases::Rig, calls_before: usize) {
    assert_eq!(r.registrar.calls().len(), calls_before, "no registrar call");
}

#[test]
fn set_binding_needs_modifier_app_slot() {
    let r = rig();
    r.kb.register_saved(&r.host);
    let calls = r.registrar.calls().len();
    // In Orasenda needs ⌘ or ⌃: Option alone and Shift alone are refused.
    for chord in ["Alt+KeyJ", "Shift+KeyJ", "Alt+Shift+KeyJ"] {
        let err = set(&r, ActionId::Capture, Slot::App, chord, false).expect_err(chord);
        assert_eq!(
            err,
            KeyboardError::NeedsModifier { slot: Slot::App },
            "{chord}"
        );
    }
    // Everywhere needs ⌘, ⌃ or ⌥; a bare key is refused there too.
    let err = set(&r, ActionId::Capture, Slot::Global, "KeyJ", false).expect_err("bare");
    assert_eq!(err, KeyboardError::NeedsModifier { slot: Slot::Global });
    let err = set(&r, ActionId::Capture, Slot::Global, "Shift+KeyJ", false).expect_err("shift");
    assert_eq!(err, KeyboardError::NeedsModifier { slot: Slot::Global });
    // Control alone is enough In Orasenda.
    set(&r, ActionId::Capture, Slot::App, "Control+KeyJ", false).expect("control is enough");
    let err = set(&r, ActionId::Capture, Slot::Global, "Nonsense", false).expect_err("junk");
    assert_eq!(err, KeyboardError::Invalid);
    assert_eq!(
        r.registrar.calls().len(),
        calls,
        "the app slot never registers"
    );
    assert_eq!(stored(&r.host, ActionId::Capture, Slot::Global), None);
}

#[test]
fn set_binding_system_keeps() {
    let r = rig();
    r.kb.register_saved(&r.host);
    let calls = r.registrar.calls().len();
    for slot in Slot::ALL {
        for keys in ["Super+Tab", "Alt+Super+Escape", "Control+ArrowUp"] {
            let err = set(&r, ActionId::Capture, slot, keys, true).expect_err(keys);
            assert_eq!(err, KeyboardError::SystemKeeps, "{keys} {slot:?}");
        }
    }
    nothing_changed(&r, calls);
    assert_eq!(stored(&r.host, ActionId::Capture, Slot::Global), None);
}

#[test]
fn set_binding_in_use_fixed_key() {
    let r = rig();
    r.kb.register_saved(&r.host);
    let calls = r.registrar.calls().len();
    for (keys, holder) in [
        ("Super+KeyK", "Commands"),
        ("Super+Comma", "Settings"),
        ("Super+KeyQ", "Quit Orasenda"),
        ("Super+Digit1", "Today"),
    ] {
        for slot in Slot::ALL {
            let err = set(&r, ActionId::Capture, slot, keys, true).expect_err(keys);
            assert_eq!(
                err,
                KeyboardError::InUse {
                    action: holder.into()
                },
                "{keys}"
            );
        }
    }
    nothing_changed(&r, calls);
}

#[test]
fn set_binding_in_use_other_slot_same_action() {
    let r = rig();
    r.kb.register_saved(&r.host);
    // The floater's In Orasenda default is ⇧⌘T: its own Everywhere slot can't take it.
    let err = set(
        &r,
        ActionId::Floater,
        Slot::Global,
        "Shift+Super+KeyT",
        true,
    )
    .expect_err("same action");
    assert_eq!(
        err,
        KeyboardError::InUse {
            action: "Floating timer, there and back".into()
        }
    );
    assert_eq!(stored(&r.host, ActionId::Floater, Slot::Global), None);
}

#[test]
fn set_binding_in_use_menu_item() {
    let r = rig();
    r.kb.register_saved(&r.host);
    // ⌘F is Full screen's menu item; Capture can't take it In Orasenda.
    let err = set(&r, ActionId::Capture, Slot::App, "Super+KeyF", false).expect_err("menu item");
    assert_eq!(
        err,
        KeyboardError::InUse {
            action: "Full screen on this display".into()
        }
    );
    // And an Everywhere default of another action.
    let err = set(&r, ActionId::StartPause, Slot::Global, CAPTURE, false).expect_err("global");
    assert_eq!(
        err,
        KeyboardError::InUse {
            action: "Capture a thought".into()
        }
    );
}

#[test]
fn set_binding_warning_then_confirmed() {
    let r = rig();
    r.kb.register_saved(&r.host);
    let calls = r.registrar.calls().len();
    let err = set(&r, ActionId::Capture, Slot::Global, "Super+KeyN", false).expect_err("warns");
    assert_eq!(
        err,
        KeyboardError::Warning {
            reason: "⌘N opens a new window in most apps.".into()
        }
    );
    nothing_changed(&r, calls);
    assert_eq!(stored(&r.host, ActionId::Capture, Slot::Global), None);
    // An Option-only chord warns too.
    let err = set(&r, ActionId::Capture, Slot::Global, "Alt+KeyJ", false).expect_err("option");
    assert!(matches!(err, KeyboardError::Warning { .. }));
    let ok = set(&r, ActionId::Capture, Slot::Global, "Super+KeyN", true).expect("confirmed");
    assert_eq!(
        ok.action(ActionId::Capture)
            .expect("listed")
            .global
            .binding
            .keys
            .as_deref(),
        Some("Super+KeyN")
    );
    assert_eq!(r.registrar.live(ActionId::Capture), ["Super+KeyN"]);
    // The In Orasenda slot is never warned about.
    set(&r, ActionId::Floater, Slot::App, "Super+KeyT", false).expect("no warning in the app");
}

#[test]
fn set_binding_register_fails_nothing_saved() {
    let r = rig();
    r.kb.register_saved(&r.host);
    r.registrar.set_failing(true);
    let err = set(
        &r,
        ActionId::Capture,
        Slot::Global,
        "Control+Alt+KeyJ",
        false,
    )
    .expect_err("registrar refuses");
    assert_eq!(err, KeyboardError::Unavailable);
    assert_eq!(stored(&r.host, ActionId::Capture, Slot::Global), None);
    assert_eq!(r.registrar.live(ActionId::Capture), [CAPTURE]);
    assert_eq!(
        global(&r, ActionId::Capture).status,
        ShortcutStatus::Registered
    );
}

#[test]
fn set_binding_store_unavailable() {
    let service = SessionService::new(
        Err(OpenError::Io("no store".into())),
        fakes(NotificationStatus::Granted, false).platform,
        T0,
    );
    let f = fakes(NotificationStatus::Granted, false);
    let host = TestHost::with(service, f.log, f.notifier);
    let registrar = Arc::new(FakeRegistrar::default());
    let kb = KeyboardService::new(registrar.clone());
    let err = kb
        .set_binding(
            &host,
            ActionId::Capture,
            Slot::Global,
            Some("Control+Alt+KeyJ".into()),
            false,
        )
        .expect_err("no store");
    assert_eq!(err, KeyboardError::Store);
    assert!(registrar.calls().is_empty(), "nothing registered");
    // The view still answers, from the defaults.
    let defaults = kb.view(&host);
    assert_eq!(
        defaults
            .action(ActionId::Capture)
            .expect("listed")
            .global
            .binding
            .keys
            .as_deref(),
        Some(CAPTURE)
    );
}

#[test]
fn restore_default_held_by_other_in_use() {
    let r = rig();
    r.kb.register_saved(&r.host);
    set(
        &r,
        ActionId::Capture,
        Slot::Global,
        "Control+Alt+KeyJ",
        false,
    )
    .expect("moves away");
    set(&r, ActionId::StartPause, Slot::Global, CAPTURE, false).expect("takes the free default");
    let err =
        r.kb.restore_default(&r.host, ActionId::Capture, Slot::Global)
            .expect_err("held");
    assert_eq!(
        err,
        KeyboardError::InUse {
            action: "Start or pause focus".into()
        }
    );
    assert_eq!(
        stored(&r.host, ActionId::Capture, Slot::Global).as_deref(),
        Some("Control+Alt+KeyJ")
    );
}

#[test]
fn restore_default_with_no_default_clears() {
    let r = rig();
    r.kb.register_saved(&r.host);
    set(&r, ActionId::Capture, Slot::App, "Control+KeyJ", false).expect("sets");
    let out =
        r.kb.restore_default(&r.host, ActionId::Capture, Slot::App)
            .expect("restores");
    let now = out.action(ActionId::Capture).expect("listed");
    assert_eq!(now.app.keys, None);
    assert!(now.app.is_default);
}

fn put(r: &super::cases::Rig, key: &str, value: &str) {
    let service = lock(r.host.service().expect("service"));
    db(&service)
        .write(1, |txn| settings::set(txn, key, &value.to_string()))
        .expect("writes");
}

#[test]
fn fold_at_launch_repair_then_register() {
    let r = rig();
    // A pre-H3 device: start or pause moved to ⌃⌥G, and capture to the floater's new default.
    put(&r, "keys.start_pause", "Control+Alt+KeyG");
    put(&r, "keys.capture", FLOATER);
    r.kb.register_saved(&r.host);
    assert_eq!(r.registrar.live(ActionId::StartPause), ["Control+Alt+KeyG"]);
    assert_eq!(r.registrar.live(ActionId::Capture), [FLOATER]);
    // The folded custom chord beats the floater's default; the floater is turned off and marked.
    assert!(r.registrar.live(ActionId::Floater).is_empty());
    let floater = global(&r, ActionId::Floater);
    assert_eq!(floater.status, ShortcutStatus::Off);
    assert!(floater.binding.repaired);
    assert_eq!(
        stored(&r.host, ActionId::Floater, Slot::Global).as_deref(),
        Some("off")
    );
}

#[test]
fn fold_restore_relaunch_keeps_default() {
    let r = rig();
    put(&r, "keys.start_pause", "Control+Alt+KeyG");
    r.kb.register_saved(&r.host);
    let out =
        r.kb.restore_default(&r.host, ActionId::StartPause, Slot::Global)
            .expect("restores");
    assert_eq!(
        out.action(ActionId::StartPause)
            .expect("listed")
            .global
            .binding
            .keys
            .as_deref(),
        Some(START)
    );
    // A relaunch: a new service over the same store. The legacy row is still there, but this
    // device already folded it, so the restored default stays.
    let relaunched = KeyboardService::new(r.registrar.clone());
    relaunched.register_saved(&r.host);
    let again = relaunched.view(&r.host);
    assert_eq!(
        again
            .action(ActionId::StartPause)
            .expect("listed")
            .global
            .binding
            .keys
            .as_deref(),
        Some(START)
    );
    assert_eq!(view(&r), again);
}
