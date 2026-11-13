//! The Focus menu in the app menu bar, after View: Start or Pause Focus, Capture a Thought… and
//! Commands… ⌘K. The full-screen and floater items are in the View and Window menus. Rust owns
//! the accelerators, so they work from every Orasenda window; the webviews bind none of them.
//!
//! The ids all start with `focus:`, which no tray or `popup:` id does.

#![cfg_attr(not(any(target_os = "macos", test)), allow(dead_code))]

use orasenda_service::api::KeyboardView;
use orasenda_service::keyboard::ActionId;

use super::{Entry, Item, app_keys};

/// The submenu's id.
pub(crate) const FOCUS_MENU_ID: &str = "focus:menu";
pub(crate) const START_PAUSE_ID: &str = "focus:start-pause";
pub(crate) const CAPTURE_ID: &str = "focus:capture";
pub(crate) const COMMANDS_ID: &str = "focus:commands";
const ID_PREFIX: &str = "focus:";

/// Commands… is a fixed key, so it is not in the registry's action list.
pub(crate) const COMMANDS_ACCELERATOR: &str = "Super+KeyK";

/// Whether `id` belongs to the Focus menu.
pub(crate) fn is_focus_id(id: &str) -> bool {
    id.starts_with(ID_PREFIX)
}

/// The registry action a Focus menu id runs, if it is one (Commands… is not).
pub(crate) fn action_of(id: &str) -> Option<ActionId> {
    match id {
        START_PAUSE_ID => Some(ActionId::StartPause),
        CAPTURE_ID => Some(ActionId::Capture),
        _ => None,
    }
}

pub(crate) fn entries(view: &KeyboardView) -> Vec<Entry> {
    let action = |id, label, action| {
        Entry::Item(Item {
            id,
            label,
            action: Some(action),
            accelerator: app_keys(view, action),
        })
    };
    vec![
        action(START_PAUSE_ID, "Start or Pause Focus", ActionId::StartPause),
        action(CAPTURE_ID, "Capture a Thought…", ActionId::Capture),
        Entry::Separator,
        Entry::Item(Item {
            id: COMMANDS_ID,
            label: "Commands…",
            action: None,
            accelerator: Some(COMMANDS_ACCELERATOR.to_string()),
        }),
    ]
}
