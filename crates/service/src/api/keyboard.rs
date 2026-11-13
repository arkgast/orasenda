//! The keyboard contract: the shortcut registry as the webview sees it (ADR-020).

use serde::{Deserialize, Serialize};

use crate::keyboard::registry::Group;
use crate::keyboard::{ActionId, Slot};

/// Whether an *Everywhere* binding is working now. Memory only: computed at launch and after each change.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ShortcutStatus {
    Registered,
    Off,
    /// Saved but not registered: another app holds it, or it could not be registered.
    Failed,
}

/// One binding of an action, in one slot.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BindingView {
    /// The canonical accelerator ("Control+Alt+KeyF"); `None` when the slot is empty.
    pub keys: Option<String>,
    /// The keys as glyphs ("⌃⌥F").
    pub display: Option<String>,
    /// The keys as words ("Control-Option-F").
    pub spoken: Option<String>,
    /// The binding is the registry's default for this slot.
    pub is_default: bool,
    /// The repair pass turned this binding off, and its row has not changed since.
    pub repaired: bool,
}

/// An *Everywhere* binding with its status.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GlobalBindingView {
    #[serde(flatten)]
    pub binding: BindingView,
    pub status: ShortcutStatus,
}

/// One registry action with both of its bindings.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ActionView {
    pub id: ActionId,
    pub label: String,
    pub description: String,
    pub group: Group,
    /// *In Orasenda*: an app-menu accelerator.
    pub app: BindingView,
    /// *Everywhere*: a global shortcut.
    pub global: GlobalBindingView,
    /// A key that works on its own in the main window (Space), or none.
    pub single_key: Option<String>,
}

/// A key that can't be rebound, listed so Settings can show it and conflicts can name it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FixedKeyView {
    pub label: String,
    pub keys: String,
    pub display: String,
    pub spoken: String,
}

/// The registry and the status of the global shortcuts: `keyboard_state`, `keyboard-changed`
/// and the result of a binding change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardView {
    pub actions: Vec<ActionView>,
    pub fixed: Vec<FixedKeyView>,
    /// Space and P on Today and Space in full screen act.
    pub single_key: bool,
    /// VoiceOver is on, so its ⌃⌥ keys may take the shortcuts.
    pub voice_over: bool,
}

/// Why a binding change failed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum KeyboardError {
    /// The keys are not a shortcut.
    Invalid,
    /// The slot needs a modifier: ⌘ or ⌃ *In Orasenda*; ⌘, ⌃ or ⌥ *Everywhere*.
    NeedsModifier { slot: Slot },
    /// macOS keeps this key, so it never reaches Orasenda.
    SystemKeeps,
    /// Orasenda uses the keys already; `action` names the holder (an action or a fixed key).
    InUse { action: String },
    /// A key other apps use; ask again with the warning confirmed to go ahead.
    Warning { reason: String },
    /// The system would not register the keys (another app may hold them). Nothing was saved.
    Unavailable,
    /// The binding could not be saved; the settings did not change.
    Store,
}

impl KeyboardView {
    /// The action `id`'s view.
    pub fn action(&self, id: ActionId) -> Option<&ActionView> {
        self.actions.iter().find(|view| view.id == id)
    }
}
