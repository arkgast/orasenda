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

/// One fixed preset's lengths in whole minutes, for the preset picker.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PresetLength {
    pub preset: Preset,
    pub focus_min: u32,
    pub break_min: u32,
}

/// The three fixed presets, in display order, read from core's table.
pub fn preset_lengths() -> Vec<PresetLength> {
    let custom = CustomSpec::default();
    [Preset::Classic, Preset::FiftyTen, Preset::DeepBlock]
        .into_iter()
        .map(|preset| {
            let spec = preset
                .spec(&custom)
                .expect("the fixed preset table is valid");
            PresetLength {
                preset,
                focus_min: u32::try_from(spec.focus_ms / 60_000).expect("minutes fit u32"),
                break_min: u32::try_from(spec.short_break_ms / 60_000).expect("minutes fit u32"),
            }
        })
        .collect()
}
