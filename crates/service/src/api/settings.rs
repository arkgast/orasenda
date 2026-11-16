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

/// The day the weekly review becomes due (`review.weekly_day`).
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum WeeklyDay {
    /// Friday.
    #[default]
    Fri,
    /// Saturday.
    Sat,
    /// Sunday.
    Sun,
    /// Monday.
    Mon,
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
    /// Notify once when a routine's time comes (`notify.routine_due`). Off by default.
    pub notify_routine_due: bool,
    /// The planning buffer on estimates, whole percent in 25, 30 ... 50 (`board.estimate_buffer`).
    pub board_estimate_buffer: u8,
    /// Space and P on Today and Space in full screen act (`keys.single_key`).
    pub single_key: bool,
    /// The weekly focus goal in hours, 0 to 60; 0 is no goal (`review.focus_goal_hours`).
    pub review_focus_goal_hours: u8,
    /// Notify when the shutdown is due (`notify.shutdown_due`). Off by default.
    pub notify_shutdown_due: bool,
    /// Notify when the weekly review is due (`notify.weekly_review`). Off by default.
    pub notify_weekly_review: bool,
    /// The shutdown time, minutes since midnight, 240 to 1439 (`review.shutdown_time`).
    pub review_shutdown_time: u16,
    /// The day the weekly review is due (`review.weekly_day`).
    pub review_weekly_day: WeeklyDay,
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
            notify_routine_due: false,
            board_estimate_buffer: 25,
            single_key: true,
            review_focus_goal_hours: 0,
            notify_shutdown_due: false,
            notify_weekly_review: false,
            review_shutdown_time: 1050,
            review_weekly_day: WeeklyDay::Fri,
        }
    }
}

/// Steady Focus, the preset a fresh install selects.
pub fn default_selected_id() -> PresetId {
    default_presets()[1].id.clone()
}
