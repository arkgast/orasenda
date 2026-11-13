//! The plugin-backed registrar and the press handler, over a fake backend.

use std::sync::{Arc, Mutex};

use crate::runtime::session::test_support::TestHost;
use orasenda_core::NotificationStatus;
use orasenda_service::api::{KeyboardError, ShortcutId};
use orasenda_service::keyboard::{Accelerator, KeyboardService, ShortcutRegistrar};

use super::*;

#[derive(Default)]
struct FakeBackend {
    calls: Mutex<Vec<String>>,
    refuse: Mutex<bool>,
    /// The table the registrar shares: it must be free during every backend call.
    held: Mutex<Option<Arc<Held>>>,
}

impl FakeBackend {
    fn assert_held_free(&self) {
        if let Some(held) = self.held.lock().unwrap().as_ref() {
            assert!(
                held.0.try_lock().is_ok(),
                "Held is locked across a backend call"
            );
        }
    }
}

impl Backend for Arc<FakeBackend> {
    fn register(&self, shortcut: Shortcut) -> Result<(), String> {
        self.assert_held_free();
        if *self.refuse.lock().unwrap() {
            return Err("HotKey already registered".to_string());
        }
        self.calls
            .lock()
            .unwrap()
            .push(format!("+{}", shortcut.id()));
        Ok(())
    }

    fn unregister(&self, shortcut: Shortcut) -> Result<(), String> {
        self.assert_held_free();
        self.calls
            .lock()
            .unwrap()
            .push(format!("-{}", shortcut.id()));
        Ok(())
    }
}

fn acc(text: &str) -> Accelerator {
    Accelerator::parse(text).unwrap()
}

fn id_of(text: &str) -> u32 {
    shortcut_of(&acc(text)).unwrap().id()
}

fn registrar() -> (
    Arc<PluginRegistrar<Arc<FakeBackend>>>,
    Arc<FakeBackend>,
    Arc<Held>,
) {
    let backend = Arc::new(FakeBackend::default());
    let held = Arc::new(Held::default());
    *backend.held.lock().unwrap() = Some(Arc::clone(&held));
    let registrar = Arc::new(PluginRegistrar::new(
        Arc::clone(&backend),
        Arc::clone(&held),
    ));
    (registrar, backend, held)
}

#[test]
fn press_dispatches_on_key_down_only() {
    let (registrar, _, held) = registrar();
    registrar
        .register(ShortcutId::StartPause, &acc("Control+Alt+KeyF"))
        .unwrap();
    registrar
        .register(ShortcutId::Capture, &acc("Control+Alt+KeyI"))
        .unwrap();
    let start = id_of("Control+Alt+KeyF");
    let capture = id_of("Control+Alt+KeyI");
    assert_eq!(
        pressed(&held, start, ShortcutState::Pressed),
        Some(ShortcutId::StartPause)
    );
    assert_eq!(pressed(&held, start, ShortcutState::Released), None);
    assert_eq!(
        pressed(&held, capture, ShortcutState::Pressed),
        Some(ShortcutId::Capture)
    );
    assert_eq!(
        pressed(&held, id_of("Control+Alt+KeyZ"), ShortcutState::Pressed),
        None
    );
}

#[test]
fn plugin_error_maps_to_unavailable() {
    let (registrar, backend, _) = registrar();
    *backend.refuse.lock().unwrap() = true;
    let direct = registrar.register(ShortcutId::StartPause, &acc("Control+Alt+KeyF"));
    assert_eq!(direct.unwrap_err().message, "HotKey already registered");
    let service = KeyboardService::new(registrar);
    let host = TestHost::fresh(NotificationStatus::Granted);
    let result = service.set_shortcut(
        &host,
        ShortcutId::StartPause,
        Some("Control+Alt+KeyG".to_string()),
    );
    assert_eq!(result.unwrap_err(), KeyboardError::Unavailable);
}

#[test]
fn register_keeps_the_held_one_and_unregister_drops_the_oldest() {
    let (registrar, backend, held) = registrar();
    let (old, new) = ("Control+Alt+KeyF", "Control+Alt+KeyG");
    registrar
        .register(ShortcutId::StartPause, &acc(old))
        .unwrap();
    registrar
        .register(ShortcutId::StartPause, &acc(new))
        .unwrap();
    assert_eq!(
        pressed(&held, id_of(old), ShortcutState::Pressed),
        Some(ShortcutId::StartPause)
    );
    registrar.unregister(ShortcutId::StartPause);
    assert_eq!(pressed(&held, id_of(old), ShortcutState::Pressed), None);
    assert_eq!(
        pressed(&held, id_of(new), ShortcutState::Pressed),
        Some(ShortcutId::StartPause)
    );
    assert_eq!(
        *backend.calls.lock().unwrap(),
        [
            format!("+{}", id_of(old)),
            format!("+{}", id_of(new)),
            format!("-{}", id_of(old))
        ]
    );
    // Nothing held: a no-op.
    registrar.unregister(ShortcutId::Capture);
    assert_eq!(backend.calls.lock().unwrap().len(), 3);
}

#[test]
fn registering_what_the_id_already_holds_is_a_no_op() {
    let (registrar, backend, _) = registrar();
    let keys = acc("Control+Alt+KeyF");
    registrar.register(ShortcutId::StartPause, &keys).unwrap();
    registrar.register(ShortcutId::StartPause, &keys).unwrap();
    assert_eq!(backend.calls.lock().unwrap().len(), 1);
}

#[test]
fn every_saved_form_parses_for_the_plugin() {
    for text in [
        "Control+Alt+KeyF",
        "Shift+Super+KeyF",
        "Super+Comma",
        "Control+Digit5",
        "Alt+Space",
        "Control+Alt+Enter",
        "Control+Backspace",
        "Control+Alt+ArrowLeft",
        "Control+Tab",
        "Super+Period",
    ] {
        assert!(shortcut_of(&acc(text)).is_ok(), "{text}");
    }
}

#[test]
fn global_keys_map_to_their_actions() {
    use orasenda_service::keyboard::ActionId;
    assert_eq!(
        plugin::action_of(ShortcutId::StartPause),
        ActionId::StartPause
    );
    assert_eq!(plugin::action_of(ShortcutId::Capture), ActionId::Capture);
}
