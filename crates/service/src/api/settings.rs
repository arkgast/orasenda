//! The saved settings.

use orasenda_core::{PresetId, default_presets};
use serde::{Deserialize, Serialize};

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
        }
    }
}

/// Steady Focus, the preset a fresh install selects.
pub fn default_selected_id() -> PresetId {
    default_presets()[1].id.clone()
}
