//! The preset library's types: a named set of focus and break lengths, the three defaults and
//! the snapshot a running session keeps. Pure: no clock, no I/O, no uniqueness (the service's).

use super::QUICK_START_MS;
use serde::{Deserialize, Serialize};
use specta::Type;

const MINUTE_MS: u64 = 60_000;
const NAME_MAX_CHARS: usize = 40;

/// Opaque preset identifier (a UUIDv7, or a default's fixed id), serialized as a bare string.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(transparent)]
pub struct PresetId(pub String);

/// One of the three presets every library starts with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum DefaultPreset {
    GentleStart,
    SteadyFocus,
    DeepWork,
}

/// A preset in the library. Lengths are in minutes; `rounds` is how many focus sessions come
/// before a long break.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PresetDef {
    pub id: PresetId,
    pub name: String,
    pub focus_min: u16,
    pub break_min: u16,
    pub long_break_min: u16,
    pub rounds: u8,
    pub default_key: Option<DefaultPreset>,
}

/// The field of a [`PresetDef`] that is out of range.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum PresetField {
    Name,
    FocusMin,
    BreakMin,
    LongBreakMin,
    Rounds,
}

/// A refused preset: the first field, in declaration order, that is out of range.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct PresetInvalid {
    pub field: PresetField,
}

impl PresetDef {
    /// Name 1-40 characters after trimming, focus 5-180, break 1-60, long break 5-90, rounds 1-8.
    pub fn validate(&self) -> Result<(), PresetInvalid> {
        let checks = [
            (PresetField::Name, normalize_name(&self.name).is_some()),
            (PresetField::FocusMin, (5..=180).contains(&self.focus_min)),
            (PresetField::BreakMin, (1..=60).contains(&self.break_min)),
            (
                PresetField::LongBreakMin,
                (5..=90).contains(&self.long_break_min),
            ),
            (PresetField::Rounds, (1..=8).contains(&self.rounds)),
        ];
        match checks.into_iter().find(|(_, ok)| !ok) {
            Some((field, _)) => Err(PresetInvalid { field }),
            None => Ok(()),
        }
    }
}

/// The trimmed name, or `None` when it is blank or longer than 40 characters.
pub fn normalize_name(raw: &str) -> Option<String> {
    let name = raw.trim();
    let chars = name.chars().count();
    (1..=NAME_MAX_CHARS)
        .contains(&chars)
        .then(|| name.to_string())
}

/// The three default presets, with the fixed ids two devices share.
pub fn default_presets() -> [PresetDef; 3] {
    let def = |n: u8, key, name: &str, focus_min, break_min, long_break_min, rounds| PresetDef {
        id: PresetId(format!("0192f6a0-0000-7000-8000-00000000000{n}")),
        name: name.to_string(),
        focus_min,
        break_min,
        long_break_min,
        rounds,
        default_key: Some(key),
    };
    [
        def(1, DefaultPreset::GentleStart, "Gentle Start", 15, 5, 15, 4),
        def(2, DefaultPreset::SteadyFocus, "Steady Focus", 25, 5, 15, 4),
        def(3, DefaultPreset::DeepWork, "Deep Work", 90, 15, 30, 2),
    ]
}

/// The snapshot of the preset a session started with. Editing or removing a library preset
/// never changes a running session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum SessionPreset {
    Library {
        id: PresetId,
        name: String,
        focus_min: u16,
        break_min: u16,
        long_break_min: u16,
        rounds: u8,
    },
    /// The built-in two-minute start: no break, no warning, no extension.
    Quick,
}

impl SessionPreset {
    /// Planned focus length in milliseconds.
    pub fn focus_ms(&self) -> u64 {
        match self {
            SessionPreset::Library { focus_min, .. } => u64::from(*focus_min) * MINUTE_MS,
            SessionPreset::Quick => QUICK_START_MS,
        }
    }

    /// The break length in milliseconds (`long` picks the long break); `Quick` has none.
    pub fn break_ms(&self, long: bool) -> u64 {
        match self {
            SessionPreset::Library {
                break_min,
                long_break_min,
                ..
            } => u64::from(if long { *long_break_min } else { *break_min }) * MINUTE_MS,
            SessionPreset::Quick => 0,
        }
    }

    /// Focus sessions before a long break; `Quick` is its own round of one.
    pub fn rounds(&self) -> u8 {
        match self {
            SessionPreset::Library { rounds, .. } => *rounds,
            SessionPreset::Quick => 1,
        }
    }
}

#[cfg(test)]
mod tests;
