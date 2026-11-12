//! The preset library as the webview and the menu bar see it.

use orasenda_core::{PresetDef, PresetField, PresetId, default_presets};
use serde::{Deserialize, Serialize};

/// One live preset, with what the list needs to say about it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PresetEntry {
    pub id: PresetId,
    pub name: String,
    pub focus_min: u16,
    pub break_min: u16,
    pub long_break_min: u16,
    pub rounds: u8,
    /// One of the three default presets.
    pub is_default: bool,
    /// A default preset whose name or lengths differ from the shipped ones. Always false for
    /// a user's own preset.
    pub is_changed: bool,
}

impl PresetEntry {
    /// The entry for `def`.
    pub fn of(def: &PresetDef) -> PresetEntry {
        let shipped = def.default_key.and_then(|key| {
            default_presets()
                .into_iter()
                .find(|d| d.default_key == Some(key))
        });
        PresetEntry {
            id: def.id.clone(),
            name: def.name.clone(),
            focus_min: def.focus_min,
            break_min: def.break_min,
            long_break_min: def.long_break_min,
            rounds: def.rounds,
            is_default: def.default_key.is_some(),
            is_changed: shipped.is_some_and(|d| {
                (
                    &d.name,
                    d.focus_min,
                    d.break_min,
                    d.long_break_min,
                    d.rounds,
                ) != (
                    &def.name,
                    def.focus_min,
                    def.break_min,
                    def.long_break_min,
                    def.rounds,
                )
            }),
        }
    }
}

/// The entries for `presets`, in order.
pub fn entries(presets: &[PresetDef]) -> Vec<PresetEntry> {
    presets.iter().map(PresetEntry::of).collect()
}

/// Why a preset call failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum PresetErrorKind {
    Invalid,
    DuplicateName,
    Limit,
    LastPreset,
    NotFound,
    Unavailable,
    Write,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PresetError {
    pub kind: PresetErrorKind,
    /// The field that is out of range, for `invalid`.
    pub field: Option<PresetField>,
    pub message: String,
}
