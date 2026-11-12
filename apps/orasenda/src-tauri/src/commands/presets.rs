//! The presets command.

use orasenda_core::PresetId;
use orasenda_service::session as service;

use super::on_blocking;
use crate::ipc::{PresetEntry, PresetError, PresetErrorKind, PresetPatch};
use crate::runtime::session;
use crate::runtime::ticker::AppHost;

// Sync: it only reads the cached library under a brief lock.
/// The live presets, in order.
#[tauri::command]
#[specta::specta]
pub fn presets_list(app: tauri::AppHandle) -> Vec<PresetEntry> {
    session::run_presets_list(&app)
}

/// What a preset command answers when its blocking task failed.
fn failed() -> PresetError {
    PresetError {
        kind: PresetErrorKind::Write,
        field: None,
        message: "Your presets couldn't be saved. Try again.".into(),
    }
}

/// Adds "New preset" at the end of the list.
#[tauri::command]
#[specta::specta]
pub async fn preset_add(app: tauri::AppHandle) -> Result<PresetEntry, PresetError> {
    on_blocking(move || service::run_preset_add(&AppHost::new(&app)))
        .await
        .unwrap_or_else(|| Err(failed()))
}

/// Changes the given fields of a preset.
#[tauri::command]
#[specta::specta]
pub async fn preset_update(
    app: tauri::AppHandle,
    id: PresetId,
    patch: PresetPatch,
) -> Result<PresetEntry, PresetError> {
    on_blocking(move || service::run_preset_update(&AppHost::new(&app), id, patch))
        .await
        .unwrap_or_else(|| Err(failed()))
}

/// Removes a preset (it can be brought back); answers the live list.
#[tauri::command]
#[specta::specta]
pub async fn preset_remove(
    app: tauri::AppHandle,
    id: PresetId,
) -> Result<Vec<PresetEntry>, PresetError> {
    on_blocking(move || service::run_preset_remove(&AppHost::new(&app), id))
        .await
        .unwrap_or_else(|| Err(failed()))
}

/// Brings a removed preset back; answers the live list.
#[tauri::command]
#[specta::specta]
pub async fn preset_undo_remove(
    app: tauri::AppHandle,
    id: PresetId,
) -> Result<Vec<PresetEntry>, PresetError> {
    on_blocking(move || service::run_preset_undo_remove(&AppHost::new(&app), id))
        .await
        .unwrap_or_else(|| Err(failed()))
}

/// Restores the default presets; answers the live list.
#[tauri::command]
#[specta::specta]
pub async fn presets_restore_defaults(
    app: tauri::AppHandle,
) -> Result<Vec<PresetEntry>, PresetError> {
    on_blocking(move || service::run_presets_restore_defaults(&AppHost::new(&app)))
        .await
        .unwrap_or_else(|| Err(failed()))
}
