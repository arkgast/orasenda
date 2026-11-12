//! The Preset submenu follows the library and the selection.

use orasenda_core::{PresetId, default_presets};
use orasenda_service::session::NativeSurface;

use super::*;
use crate::ipc::{PresetEntry, Settings, entries};

fn user_preset(name: &str, focus_min: u16, break_min: u16) -> PresetEntry {
    PresetEntry {
        id: PresetId(format!("user-{name}")),
        name: name.to_string(),
        focus_min,
        break_min,
        long_break_min: 20,
        rounds: 4,
        is_default: false,
        is_changed: false,
    }
}

fn submenu(entries: &[MenuEntry]) -> &[MenuEntry] {
    entries
        .iter()
        .find_map(|entry| match entry {
            MenuEntry::Submenu { entries, .. } => Some(entries.as_slice()),
            _ => None,
        })
        .expect("the idle menu has a Preset submenu")
}

/// `(id, label, checked)` of the preset check items.
fn preset_items(entries: &[MenuEntry]) -> Vec<(String, String, Option<bool>)> {
    submenu(entries)
        .iter()
        .filter_map(|entry| match entry {
            MenuEntry::Item {
                id, label, checked, ..
            } if id.starts_with("preset:") => Some((id.clone(), label.clone(), *checked)),
            _ => None,
        })
        .collect()
}

#[test]
fn tray_preset_submenu_from_library() {
    let mut library = entries(&default_presets());
    library.push(user_preset("50/10", 50, 10));
    let selected = library[3].id.clone();
    let next = NextSession::new(
        &Settings {
            preset_id: selected.clone(),
            ..Settings::default()
        },
        library,
    );
    let menu = menu_items(&idle(), &next, false);
    let items = preset_items(&menu);
    let labels: Vec<_> = items.iter().map(|(_, label, _)| label.as_str()).collect();
    assert_eq!(
        labels,
        [
            "Gentle Start 15 / 5",
            "Steady Focus 25 / 5",
            "Deep Work 90 / 15",
            "50/10 50 / 10"
        ]
    );
    // Every item is a check item; only the selected one is checked.
    let checked: Vec<_> = items.iter().map(|(_, _, c)| *c).collect();
    assert_eq!(checked, [Some(false), Some(false), Some(false), Some(true)]);
    // The checked item's id names the selected library preset.
    let on = &items[3].0;
    assert_eq!(
        menu_command(on),
        Some(MenuCommand::SetPreset(selected)),
        "{on}"
    );
    assert_eq!(next.focus_min(), 50);
    assert_eq!(
        labels_of(&menu)[0],
        "Start focus · 50 min",
        "Start shows the selected preset's focus"
    );
}

fn labels_of(entries: &[MenuEntry]) -> Vec<String> {
    entries
        .iter()
        .map(|entry| match entry {
            MenuEntry::Item { label, .. } => label.clone(),
            _ => String::new(),
        })
        .collect()
}

#[test]
fn an_unknown_selection_checks_the_first_preset() {
    let next = NextSession::new(
        &Settings {
            preset_id: PresetId("gone".into()),
            ..Settings::default()
        },
        entries(&default_presets()),
    );
    let checked: Vec<_> = preset_items(&menu_items(&idle(), &next, false))
        .into_iter()
        .map(|(_, _, c)| c)
        .collect();
    assert_eq!(checked, [Some(true), Some(false), Some(false)]);
}

#[test]
fn preset_choice_changes_only_the_preset() {
    let current = Settings::default();
    let id = default_presets()[2].id.clone();
    let chosen = crate::tray::menu::preset_choice(current.clone(), id.clone());
    assert_eq!(
        chosen,
        Settings {
            preset_id: id,
            ..current
        }
    );
}

#[test]
fn settings_change_rerenders_menu() {
    let (tray, calls) = tray_with(Recorder::default());
    let deep = default_presets()[2].id.clone();
    tray.settings_changed(&Settings {
        preset_id: deep.clone(),
        ..Settings::default()
    });
    let next = NextSession::new(
        &Settings {
            preset_id: deep.clone(),
            ..Settings::default()
        },
        entries(&default_presets()),
    );
    assert_eq!(
        calls.take(),
        [Call::Menu(menu_items(&idle(), &next, false), None)]
    );
    assert_eq!(
        labels_of(&menu_items(&idle(), &next, false))[0],
        "Start focus · 90 min"
    );

    // The same settings again rebuild the menu once (a click toggled its check item, and a
    // failed save sends the unchanged settings to undo that): the menu only, nothing else.
    tray.settings_changed(&Settings {
        preset_id: deep,
        ..Settings::default()
    });
    assert_eq!(
        calls.take(),
        [Call::Menu(menu_items(&idle(), &next, false), None)]
    );
}

#[test]
fn presets_changed_rerenders_the_submenu_from_the_new_library() {
    let (tray, calls) = tray_with(Recorder::default());
    let mut library = entries(&default_presets());
    library.remove(0);
    library.push(user_preset("Mine", 40, 8));
    tray.presets_changed(&library);
    let next = NextSession::default().with_presets(library);
    let calls = calls.take();
    assert_eq!(calls, [Call::Menu(menu_items(&idle(), &next, false), None)]);
    let Call::Menu(items, _) = &calls[0] else {
        unreachable!()
    };
    let labels: Vec<_> = preset_items(items).into_iter().map(|(_, l, _)| l).collect();
    assert_eq!(
        labels,
        ["Steady Focus 25 / 5", "Deep Work 90 / 15", "Mine 40 / 8"]
    );
}
