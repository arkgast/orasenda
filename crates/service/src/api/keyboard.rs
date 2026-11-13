//! The keyboard contract: the global shortcuts and what the webview sees of them.

use serde::{Deserialize, Serialize};

/// A global shortcut: it works from any app.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ShortcutId {
    /// Starts the selected preset, or pauses or resumes a running session.
    StartPause,
    /// Opens the capture panel.
    Capture,
}

impl ShortcutId {
    /// The saved default: ⌃⌥F and ⌃⌥N.
    pub fn default_keys(self) -> &'static str {
        match self {
            ShortcutId::StartPause => "Control+Alt+KeyF",
            ShortcutId::Capture => "Control+Alt+KeyN",
        }
    }

    /// The other global shortcut.
    pub fn other(self) -> ShortcutId {
        match self {
            ShortcutId::StartPause => ShortcutId::Capture,
            ShortcutId::Capture => ShortcutId::StartPause,
        }
    }
}

/// Whether a global shortcut is working now. Memory only: computed at launch and after each change.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ShortcutStatus {
    Registered,
    Off,
    /// Saved but not registered: another app holds it, or it could not be registered.
    Failed,
}

/// One global shortcut as the webview shows it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutView {
    /// The canonical accelerator ("Control+Alt+KeyF"); `None` when it is off.
    pub keys: Option<String>,
    /// The keys as glyphs ("⌃⌥F").
    pub display: Option<String>,
    /// The keys as words ("Control-Option-F").
    pub spoken: Option<String>,
    pub status: ShortcutStatus,
}

/// The keyboard settings and the status of both global shortcuts: `keyboard_state` and the
/// `keyboard-changed` event.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct KeyboardView {
    pub start_pause: ShortcutView,
    pub capture: ShortcutView,
    /// Space, F and P on Today and Space in Focus view work.
    pub single_key: bool,
    /// VoiceOver is on, so its ⌃⌥ keys may take the shortcuts.
    pub voice_over: bool,
}

/// Why a shortcut change failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum KeyboardError {
    /// The keys are not a shortcut.
    Invalid,
    /// Orasenda uses the keys already: the other global shortcut or an app menu shortcut.
    InUseByOrasenda,
    /// The system would not register the keys (another app may hold them). Nothing was saved.
    Unavailable,
    /// The shortcut could not be saved. The old one still works.
    Store,
}
