//! The menu entries per state: labels, accelerators and the preset ids.

use super::*;
use crate::ipc::{DisplayInfo, Mode, TimerView};
use orasenda_core::Phase;

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

/// "Start focus · 25 min", then the user's keys as inert text when the shortcut is registered.
fn start_label(next: &NextSession) -> String {
    let label = format!("Start focus · {} min", next.focus_min());
    match &next.keys {
        Some(keys) => format!("{label}  {keys}"),
        None => label,
    }
}

/// Full screen (one item per display when several, the main window's first) and
/// Show or Hide floating timer. No accelerators: the Focus menu owns them. Empty without displays.
fn focus_entries(focus: &FocusItems) -> Vec<MenuEntry> {
    let full_screen_id = |display: &DisplayInfo| format!("{FULL_SCREEN_PREFIX}{}", display.id);
    let full_screen = match focus.displays.as_slice() {
        [] => return Vec::new(),
        [only] => item_with_id(full_screen_id(only), "Full screen"),
        many => MenuEntry::Submenu {
            label: "Full screen",
            entries: many
                .iter()
                .map(|d| item_with_id(full_screen_id(d), &format!("Full screen on {}", d.name)))
                .collect(),
        },
    };
    let floater = if focus.floater_shown {
        item(HIDE_FLOATER, "Hide floating timer")
    } else {
        item(SHOW_FLOATER, "Show floating timer")
    };
    vec![MenuEntry::Separator, full_screen, floater]
}

fn item_with_id(id: String, label: &str) -> MenuEntry {
    MenuEntry::Item {
        id,
        label: label.to_string(),
        accelerator: None,
        checked: None,
    }
}

/// The menu for `view`, top to bottom. `focus` adds the Focus views' group after the session
/// group; `spike` adds the Developer panel item, in its own group above Quit.
pub(crate) fn menu_items(
    view: &TimerView,
    next: &NextSession,
    focus: &FocusItems,
    spike: bool,
) -> Vec<MenuEntry> {
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
            let mut idle = Vec::new();
            if view.offer.is_some() {
                idle.extend([
                    item(KEEP_GOING, KEEP_GOING),
                    item(STOP_HERE, STOP_HERE),
                    MenuEntry::Separator,
                ]);
            }
            idle.extend([
                item(START, &start_label(next)),
                item(JUST_TWO, "Just 2 minutes"),
                MenuEntry::Submenu {
                    label: "Preset",
                    entries: presets,
                },
            ]);
            idle
        }
        Mode::Paused => session_entries(view, true),
        Mode::Focus | Mode::Break | Mode::Warning => session_entries(view, false),
    };
    entries.extend(focus_entries(focus));
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

/// The header and the session actions of a running or paused session: a break, a focus
/// in an automatic step (a break one click away instead of "+10 min") or a plain focus.
fn session_entries(view: &TimerView, paused: bool) -> Vec<MenuEntry> {
    let mut entries = vec![MenuEntry::Header, MenuEntry::Separator];
    if view.phase == Phase::Break {
        let pause = if paused {
            item(RESUME_BREAK, RESUME_BREAK)
        } else {
            item(PAUSE_BREAK, PAUSE_BREAK)
        };
        entries.push(pause);
        if view.can_extend {
            entries.push(item(BACK_TO_FOCUS, BACK_TO_FOCUS));
        }
        entries.push(item(SKIP_BREAK, SKIP_BREAK));
        return entries;
    }
    entries.push(if paused {
        item(RESUME, RESUME)
    } else {
        item(PAUSE, PAUSE)
    });
    if !paused && view.check_in.is_some() {
        entries.push(item(TAKE_BREAK, TAKE_BREAK));
    } else if view.can_extend {
        entries.push(item(ADD_TEN, ADD_TEN));
    }
    entries.push(item(END_SESSION, END_SESSION));
    entries
}
