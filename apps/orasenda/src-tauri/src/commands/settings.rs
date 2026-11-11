//! The settings commands.

use super::on_blocking;
use crate::ipc::{Settings, SettingsError, SettingsErrorKind};
use crate::runtime::session;

// Sync: it only reads the cached settings under a brief lock.
/// The saved settings.
#[tauri::command]
#[specta::specta]
pub fn settings_get(app: tauri::AppHandle) -> Settings {
    session::current_settings(&app)
}

/// Saves the settings.
#[tauri::command]
#[specta::specta]
pub async fn settings_set(app: tauri::AppHandle, settings: Settings) -> Result<(), SettingsError> {
    on_blocking(move || session::run_set_settings(&app, settings))
        .await
        .unwrap_or_else(|| {
            Err(SettingsError {
                kind: SettingsErrorKind::Write,
                message: "Your settings couldn't be saved. Try again.".into(),
            })
        })
}
