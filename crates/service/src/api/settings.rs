//! The saved settings.

use orasenda_core::{PresetId, default_presets};
use serde::{Deserialize, Serialize};

use super::ShortcutId;

/// The colour theme the person chose.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    /// Follow the system appearance.
    #[default]
    System,
    /// Always light.
    Light,
    /// Always dark.
    Dark,
}

/// The saved settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub theme: Theme,
    /// The selected library preset (`timer.preset`).
    pub preset_id: PresetId,
    /// How many times "+10 min" is offered in one session, 0 to 3 (`timer.extension_cap`).
    pub extension_cap: u8,
    /// Keep going in 10-minute steps when a focus ends (`timer.auto_continue`).
    pub auto_continue: bool,
    /// Where auto-continue steps stop, in minutes, 60 to 150 (`timer.longest_focus_min`).
    pub longest_focus_min: u16,
    /// Note, once a day, when the day's focus passes `deep_cap_hours` (`timer.deep_cap_on`).
    pub deep_cap_on: bool,
    /// The deep-hours cap, 2 to 8 hours (`timer.deep_cap_hours`).
    pub deep_cap_hours: u8,
    pub notify_session_end: bool,
    /// Notify two minutes before the end (`notify.two_minutes`).
    pub notify_two_minutes: bool,
    /// The start or pause shortcut: a canonical accelerator or `"off"` (`keys.start_pause`).
    /// Changed only through `keyboard_set_shortcut`; `settings_set` ignores it.
    pub start_pause_keys: String,
    /// The capture shortcut, the same (`keys.capture`).
    pub capture_keys: String,
    /// Space, F and P on Today and Space in Focus view act (`keys.single_key`).
    pub single_key: bool,
}

impl Default for Settings {
    fn default() -> Settings {
        Settings {
            theme: Theme::System,
            preset_id: default_selected_id(),
            extension_cap: 2,
            auto_continue: false,
            longest_focus_min: 90,
            deep_cap_on: true,
            deep_cap_hours: 4,
            notify_session_end: false,
            notify_two_minutes: false,
            start_pause_keys: ShortcutId::StartPause.default_keys().into(),
            capture_keys: ShortcutId::Capture.default_keys().into(),
            single_key: true,
        }
    }
}

/// Steady Focus, the preset a fresh install selects.
pub fn default_selected_id() -> PresetId {
    default_presets()[1].id.clone()
}
