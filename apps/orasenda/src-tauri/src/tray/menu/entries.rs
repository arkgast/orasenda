//! The menu entries per state: labels, accelerators and the preset ids.

use super::*;
use crate::ipc::{Mode, TimerView};

fn item(id: &'static str, label: &str) -> MenuEntry {
    MenuEntry::Item {
        id: id.to_string(),
        label: label.to_string(),
        accelerator: None,
        checked: None,
    }
}

fn with_accelerator(id: &'static str, label: &str, accelerator: &'static str) -> MenuEntry {
    MenuEntry::Item {
        id: id.to_string(),
        label: label.to_string(),
        accelerator: Some(accelerator),
        checked: None,
    }
}

/// The item id of library preset `id`.
pub(super) fn preset_item_id(id: &PresetId) -> String {
    format!("{PRESET_PREFIX}{}", id.0)
}

/// The preset check item's label, as in the Today popover: "Steady Focus 25 / 5".
fn preset_label(preset: &PresetEntry) -> String {
    format!(
        "{} {} / {}",
        preset.name, preset.focus_min, preset.break_min
    )
}

/// The menu for `view`, top to bottom. `spike` adds the Developer panel item, in its own
/// group above Quit.
pub(crate) fn menu_items(view: &TimerView, next: &NextSession, spike: bool) -> Vec<MenuEntry> {
    let mut entries = match view.mode {
        Mode::Idle => {
            let mut presets: Vec<MenuEntry> = next
                .presets
                .iter()
                .map(|preset| MenuEntry::Item {
                    id: preset_item_id(&preset.id),
                    label: preset_label(preset),
                    accelerator: None,
                    checked: Some(preset.id == next.selected),
                })
                .collect();
            presets.push(MenuEntry::Separator);
            presets.push(item(EDIT_TIMES, "Edit presets in Settings…"));
            vec![
                item(START, &format!("Start focus · {} min", next.focus_min())),
                item(JUST_TWO, "Just 2 minutes"),
                MenuEntry::Submenu {
                    label: "Preset",
                    entries: presets,
                },
            ]
        }
        Mode::Focus => vec![
            MenuEntry::Header,
            MenuEntry::Separator,
            item(PAUSE, PAUSE),
            item(END_SESSION, END_SESSION),
        ],
        Mode::Paused => vec![
            MenuEntry::Header,
            MenuEntry::Separator,
            item(RESUME, RESUME),
            item(END_SESSION, END_SESSION),
        ],
    };
    entries.extend([
        MenuEntry::Separator,
        item(SHOW, SHOW),
        with_accelerator(SETTINGS, SETTINGS, "CmdOrCtrl+,"),
        MenuEntry::Separator,
    ]);
    if spike {
        entries.extend([item(DEV_PANEL, "Developer panel"), MenuEntry::Separator]);
    }
    entries.extend([with_accelerator(QUIT, QUIT, "CmdOrCtrl+Q")]);
    entries
}
