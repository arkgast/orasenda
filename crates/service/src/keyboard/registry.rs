//! The shortcut registry (ADR-020): every action with its two default bindings, and the fixed
//! keys that can't be rebound but count in every clash check. The table's order is the registry
//! order. Accelerators are written in the canonical form of [`super::Accelerator`].

use super::{ActionId, Slot};

/// Where an action works.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum Group {
    FullScreen,
    Timer,
    Capture,
}

/// One action of the registry.
#[derive(Debug, Clone, Copy)]
pub struct Action {
    pub id: ActionId,
    pub label: &'static str,
    pub description: &'static str,
    pub group: Group,
    /// The *In Orasenda* default; `None` for none.
    pub app_default: Option<&'static str>,
    /// The *Everywhere* default; `None` for none.
    pub global_default: Option<&'static str>,
    /// A key that works on its own in `main` (Space, P); not an accelerator.
    pub single_key: Option<&'static str>,
}

impl Action {
    /// The default of `slot`.
    pub fn default_for(&self, slot: Slot) -> Option<&'static str> {
        match slot {
            Slot::App => self.app_default,
            Slot::Global => self.global_default,
        }
    }
}

/// A key the user can't rebind. `keys` is canonical, or a bare key name for keys such as Esc
/// that are not an [`super::Accelerator`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FixedKey {
    pub label: &'static str,
    pub keys: &'static str,
}

pub const ACTIONS: &[Action] = &[
    Action {
        id: ActionId::FullScreen,
        label: "Full screen on this display",
        description: "Fills this display with the timer.",
        group: Group::FullScreen,
        app_default: Some("Super+KeyF"),
        global_default: Some("Control+Alt+Super+KeyF"),
        single_key: None,
    },
    Action {
        id: ActionId::FullScreenOther,
        label: "Full screen on another display",
        description: "Fills another display with the timer.",
        group: Group::FullScreen,
        app_default: Some("Shift+Super+KeyF"),
        global_default: Some("Control+Alt+Shift+Super+KeyF"),
        single_key: None,
    },
    Action {
        id: ActionId::LeaveFullScreen,
        label: "Leave full screen",
        description: "Goes back to the window.",
        group: Group::FullScreen,
        app_default: None,
        global_default: None,
        single_key: None,
    },
    Action {
        id: ActionId::Floater,
        label: "Floating timer, there and back",
        description: "Opens the small timer, or brings the window back.",
        group: Group::Timer,
        app_default: Some("Shift+Super+KeyT"),
        global_default: Some("Control+Alt+Super+KeyT"),
        single_key: None,
    },
    Action {
        id: ActionId::StartPause,
        label: "Start or pause focus",
        description: "Starts a focus session, or pauses the one that is running.",
        group: Group::Timer,
        app_default: None,
        global_default: Some("Control+Alt+Super+Space"),
        single_key: Some("Space"),
    },
    Action {
        id: ActionId::Capture,
        label: "Capture a thought",
        description: "Opens a small box to jot a thought down.",
        group: Group::Capture,
        app_default: None,
        global_default: Some("Control+Alt+Super+KeyN"),
        single_key: None,
    },
];

const fn fixed(label: &'static str, keys: &'static str) -> FixedKey {
    FixedKey { label, keys }
}

pub const FIXED: &[FixedKey] = &[
    fixed("Commands", "Super+KeyK"),
    fixed("Settings", "Super+Comma"),
    fixed("Start focus", "Super+Enter"),
    fixed("Just 2 minutes", "Shift+Super+Enter"),
    fixed("End session", "Super+Period"),
    fixed("Today", "Super+Digit1"),
    fixed("Board", "Super+Digit2"),
    fixed("Calendar", "Super+Digit3"),
    fixed("Routines", "Super+Digit4"),
    fixed("Review", "Super+Digit5"),
    fixed("Settings", "Super+Digit6"),
    fixed("Leave full screen", "Escape"),
    fixed("Quit Orasenda", "Super+KeyQ"),
    fixed("Hide Orasenda", "Super+KeyH"),
    fixed("Hide Others", "Alt+Super+KeyH"),
    fixed("Close Window", "Super+KeyW"),
    fixed("Minimize", "Super+KeyM"),
    fixed("Cut", "Super+KeyX"),
    fixed("Copy", "Super+KeyC"),
    fixed("Paste", "Super+KeyV"),
    fixed("Undo", "Super+KeyZ"),
    fixed("Redo", "Shift+Super+KeyZ"),
    fixed("Select All", "Super+KeyA"),
];

/// The registry entry of `id`.
pub fn action(id: ActionId) -> &'static Action {
    ACTIONS
        .iter()
        .find(|a| a.id == id)
        .expect("every ActionId is in the registry")
}

/// The settings key of a binding: `keys.app.floater`.
pub fn settings_key(id: ActionId, slot: Slot) -> String {
    format!("{}.{}", slot.prefix(), id.name())
}
