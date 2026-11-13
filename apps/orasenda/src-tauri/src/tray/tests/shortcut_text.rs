//! The start item's inert shortcut text: the user's keys when registered, nothing otherwise,
//! and never a live accelerator.

use orasenda_core::default_presets;
use orasenda_service::api::{KeyboardView, ShortcutStatus};
use orasenda_service::keyboard::shortcut_view;

use super::*;
use crate::ipc::entries;

fn keyboard(status: ShortcutStatus, keys: &str) -> KeyboardView {
    KeyboardView {
        start_pause: shortcut_view(keys, status),
        capture: shortcut_view("off", ShortcutStatus::Off),
        single_key: true,
        voice_over: false,
    }
}

fn start_item(entries: &[MenuEntry]) -> (String, Option<&'static str>) {
    entries
        .iter()
        .find_map(|entry| match entry {
            MenuEntry::Item {
                id,
                label,
                accelerator,
                ..
            } if id == START => Some((label.clone(), *accelerator)),
            _ => None,
        })
        .expect("the idle menu has a Start item")
}

fn idle_menu(next: &NextSession) -> Vec<MenuEntry> {
    menu_items(&idle(), next, &FocusItems::default(), false)
}

#[test]
fn tray_start_item_inert_text_registered() {
    let next = NextSession::default().with_keys(start_keys(&keyboard(
        ShortcutStatus::Registered,
        "Control+Alt+KeyF",
    )));
    assert_eq!(start_item(&idle_menu(&next)).0, "Start focus · 25 min  ⌃⌥F");
    let custom = NextSession::default().with_keys(start_keys(&keyboard(
        ShortcutStatus::Registered,
        "Control+Shift+KeyS",
    )));
    assert_eq!(
        start_item(&idle_menu(&custom)).0,
        "Start focus · 25 min  ⌃⇧S"
    );
}

#[test]
fn tray_start_item_no_text_when_off_or_failed() {
    for (status, keys) in [
        (ShortcutStatus::Off, "off"),
        (ShortcutStatus::Failed, "Control+Alt+KeyF"),
    ] {
        let next = NextSession::default().with_keys(start_keys(&keyboard(status, keys)));
        assert_eq!(start_item(&idle_menu(&next)).0, "Start focus · 25 min");
    }
}

#[test]
fn tray_start_item_has_no_accelerator() {
    let next = NextSession::default().with_keys(Some("⌃⌥F".to_string()));
    assert_eq!(start_item(&idle_menu(&next)).1, None);
    assert_eq!(start_item(&idle_menu(&NextSession::default())).1, None);
}

#[test]
fn keyboard_changed_redraws_the_menu_and_a_repeat_costs_nothing() {
    let (tray, calls) = tray_with(Recorder::default());
    let registered = keyboard(ShortcutStatus::Registered, "Control+Alt+KeyF");
    tray.keyboard_changed(&registered);
    let next = NextSession::default().with_keys(Some("⌃⌥F".to_string()));
    assert_eq!(calls.take(), [Call::Menu(idle_menu(&next), None)],);
    tray.keyboard_changed(&registered);
    assert_eq!(calls.take(), []);
    tray.keyboard_changed(&keyboard(ShortcutStatus::Failed, "Control+Alt+KeyF"));
    assert_eq!(
        calls.take(),
        [Call::Menu(idle_menu(&NextSession::default()), None)]
    );
}

#[test]
fn the_keys_survive_a_settings_or_library_change() {
    let next = NextSession::default().with_keys(Some("⌃⌥F".to_string()));
    let after = next.with_settings(&crate::ipc::Settings::default());
    assert_eq!(
        start_item(&idle_menu(&after)).0,
        "Start focus · 25 min  ⌃⌥F"
    );
    let after = next.with_presets(entries(&default_presets()));
    assert_eq!(
        start_item(&idle_menu(&after)).0,
        "Start focus · 25 min  ⌃⌥F"
    );
}
