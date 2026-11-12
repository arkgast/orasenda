//! The presets command.

use crate::ipc::PresetEntry;
use crate::runtime::session;

// Sync: it only reads the cached library under a brief lock.
/// The live presets, in order.
#[tauri::command]
#[specta::specta]
pub fn presets_list(app: tauri::AppHandle) -> Vec<PresetEntry> {
    session::run_presets_list(&app)
}
