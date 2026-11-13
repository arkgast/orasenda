//! The one-time tips Today can show after a session ends.

use serde::{Deserialize, Serialize};

/// A tip the timer view can carry. The copy lives in the webview; the variant follows the
/// shortcut's status, VoiceOver and the single-key setting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TipId {
    /// After the first session end: the start or pause shortcut works from anywhere.
    GlobalShortcut,
    /// The same, when the shortcut is off, failed or VoiceOver is on: the menu bar item does.
    GlobalShortcutMenu,
    /// After the second session end, with single keys off: the Focus view's own shortcuts.
    FocusView,
    /// The same, with single keys on: the F key.
    FocusViewKeys,
}

/// How Today saw a tip.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TipSeen {
    /// The person pressed Got it: seen for good.
    GotIt,
    /// The tip was rendered: the first showing is counted, the second one marks it seen.
    Shown,
}
