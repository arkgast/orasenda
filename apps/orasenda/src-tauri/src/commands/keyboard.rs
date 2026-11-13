//! The keyboard commands: the global shortcuts and their status.

use super::on_blocking;
use crate::ipc::{KeyboardError, KeyboardView, ShortcutId};
use crate::runtime::keyboard;

/// The global shortcuts, their status and the single-key setting.
#[tauri::command]
#[specta::specta]
pub async fn keyboard_state(app: tauri::AppHandle) -> KeyboardView {
    let fallback = app.clone();
    on_blocking(move || keyboard::state(&app))
        .await
        .unwrap_or_else(|| keyboard::state(&fallback))
}

/// Suspends (`on`) or restores (`off`) every menu accelerator, global shortcut and single key while a
/// shortcut recorder listens. In memory only; a repeat of the same state does nothing.
#[tauri::command]
#[specta::specta]
pub async fn keyboard_recording(app: tauri::AppHandle, on: bool) {
    // Taking the menu off and unregistering shortcuts wait on the main thread, so this is not run on it.
    #[cfg(desktop)]
    on_blocking(move || crate::runtime::recording::set(&app, on)).await;
    #[cfg(not(desktop))]
    let _ = (app, on);
}

/// Changes a global shortcut; `null` turns it off. It is saved only after it registers.
#[tauri::command]
#[specta::specta]
pub async fn keyboard_set_shortcut(
    app: tauri::AppHandle,
    id: ShortcutId,
    keys: Option<String>,
) -> Result<KeyboardView, KeyboardError> {
    on_blocking(move || keyboard::set_shortcut(&app, id, keys))
        .await
        .unwrap_or(Err(KeyboardError::Store))
}

/// Sets a global shortcut back to its default, by the same path as a change.
#[tauri::command]
#[specta::specta]
pub async fn keyboard_restore_default(
    app: tauri::AppHandle,
    id: ShortcutId,
) -> Result<KeyboardView, KeyboardError> {
    on_blocking(move || keyboard::restore_default(&app, id))
        .await
        .unwrap_or(Err(KeyboardError::Store))
}
