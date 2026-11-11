//! The saved settings.

use orasenda_core::{CustomSpec, Preset};
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
    pub preset: Preset,
    pub custom: CustomSpec,
    pub notify_session_end: bool,
}

impl Default for Settings {
    fn default() -> Settings {
        Settings {
            theme: Theme::System,
            preset: Preset::Classic,
            custom: CustomSpec::default(),
            notify_session_end: false,
        }
    }
}
