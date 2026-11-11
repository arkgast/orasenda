//! The presets command.

use crate::ipc::{PresetLength, preset_lengths};

// Sync: it reads core's constant table.
/// The three fixed presets' lengths, in display order.
#[tauri::command]
#[specta::specta]
pub fn presets_get() -> Vec<PresetLength> {
    preset_lengths()
}
