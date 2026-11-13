//! The keyboard commands: the global shortcuts and their status.

use super::on_blocking;
use orasenda_service::keyboard::{ActionId, Slot};

use crate::ipc::{KeyboardError, KeyboardView};
use crate::runtime::keyboard;

/// The shortcut registry: every action with both bindings, the fixed keys, the status of the
/// *Everywhere* shortcuts and the single-key setting.
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

/// Changes one binding of an action; `null` empties the slot. An *Everywhere* binding is saved
/// only after it registers. `confirmWarning` goes ahead past a well-known key's warning.
#[tauri::command]
#[specta::specta]
pub async fn keyboard_set_binding(
    app: tauri::AppHandle,
    id: ActionId,
    slot: Slot,
    keys: Option<String>,
    confirm_warning: bool,
) -> Result<KeyboardView, KeyboardError> {
    on_blocking(move || keyboard::set_binding(&app, id, slot, keys, confirm_warning))
        .await
        .unwrap_or(Err(KeyboardError::Store))
}

/// Sets one binding back to its default, by the same path as a change.
#[tauri::command]
#[specta::specta]
pub async fn keyboard_restore_default(
    app: tauri::AppHandle,
    id: ActionId,
    slot: Slot,
) -> Result<KeyboardView, KeyboardError> {
    on_blocking(move || keyboard::restore_default(&app, id, slot))
        .await
        .unwrap_or(Err(KeyboardError::Store))
}

/// Runs an action by its id, the same way a menu, a global shortcut or the tray would (`actions::run`).
/// A repeat within 300 ms is dropped. The work runs on its own thread; a failure is logged.
#[tauri::command]
#[specta::specta]
pub async fn action_run(app: tauri::AppHandle, id: orasenda_service::keyboard::ActionId) {
    crate::actions::run(&app, id, orasenda_service::keyboard::Source::Webview);
}
