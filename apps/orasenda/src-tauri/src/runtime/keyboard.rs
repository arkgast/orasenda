//! The global shortcuts in the app: the keyboard service in managed state and the registrar it
//! uses. The real registrar (the global-shortcut plugin) arrives with F5 (#390); until then
//! [`UnavailableRegistrar`] refuses every registration, so a shortcut reports `failed` and a
//! change reports `unavailable`, never a success that did nothing.

use std::sync::Arc;

use orasenda_service::api::{KeyboardError, KeyboardView, ShortcutId, ShortcutStatus};
use orasenda_service::keyboard::{
    Accelerator, KeyboardService, RegisterError, ShortcutRegistrar, shortcut_view,
};
use tauri::{Manager, State};

use crate::runtime::ticker::AppHost;

/// Registers nothing and says so. F5 replaces it.
pub struct UnavailableRegistrar;

impl ShortcutRegistrar for UnavailableRegistrar {
    fn register(&self, _id: ShortcutId, _acc: &Accelerator) -> Result<(), RegisterError> {
        Err(RegisterError::new("global shortcuts are not available yet"))
    }

    fn unregister(&self, _id: ShortcutId) {}
}

/// Manages the keyboard service. Called before the windows exist.
pub fn manage(app: &tauri::App) {
    app.manage(KeyboardService::new(Arc::new(UnavailableRegistrar)));
}

/// Registers the saved shortcuts. Called once the store is open; it writes nothing.
pub fn register_saved(app: &tauri::AppHandle) {
    if let Some(keyboard) = app.try_state::<KeyboardService>() {
        keyboard.register_saved(&AppHost::new(app));
    }
}

fn service(app: &tauri::AppHandle) -> Option<State<'_, KeyboardService>> {
    app.try_state::<KeyboardService>()
}

/// `keyboard_state` on the app. Before setup: both shortcuts failed, nothing else known.
pub fn state(app: &tauri::AppHandle) -> KeyboardView {
    match service(app) {
        Some(keyboard) => keyboard.view(&AppHost::new(app)),
        None => {
            let failed = |id: ShortcutId| shortcut_view(id.default_keys(), ShortcutStatus::Failed);
            KeyboardView {
                start_pause: failed(ShortcutId::StartPause),
                capture: failed(ShortcutId::Capture),
                single_key: true,
                voice_over: false,
            }
        }
    }
}

/// `keyboard_set_shortcut` on the app.
pub fn set_shortcut(
    app: &tauri::AppHandle,
    id: ShortcutId,
    keys: Option<String>,
) -> Result<KeyboardView, KeyboardError> {
    let keyboard = service(app).ok_or(KeyboardError::Unavailable)?;
    keyboard.set_shortcut(&AppHost::new(app), id, keys)
}

/// `keyboard_restore_default` on the app.
pub fn restore_default(
    app: &tauri::AppHandle,
    id: ShortcutId,
) -> Result<KeyboardView, KeyboardError> {
    let keyboard = service(app).ok_or(KeyboardError::Unavailable)?;
    keyboard.restore_default(&AppHost::new(app), id)
}
