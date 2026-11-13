//! The global shortcuts in the app: the keyboard service in managed state and the registrar it
//! uses. On desktop that is the global-shortcut plugin ([`crate::shortcuts`]). Elsewhere
//! [`UnavailableRegistrar`] refuses every registration, so a shortcut reports `failed` and a
//! change reports `unavailable`, never a success that did nothing.

use std::sync::Arc;

use orasenda_service::api::{KeyboardError, KeyboardView, ShortcutId, ShortcutStatus};
#[cfg(not(desktop))]
use orasenda_service::keyboard::{Accelerator, RegisterError};
use orasenda_service::keyboard::{KeyboardService, ShortcutRegistrar, shortcut_view};
use tauri::{Manager, State};

use crate::runtime::ticker::AppHost;

/// Registers nothing and says so. Used where there is no global-shortcut plugin (mobile).
#[cfg(not(desktop))]
pub struct UnavailableRegistrar;

#[cfg(not(desktop))]
impl ShortcutRegistrar for UnavailableRegistrar {
    fn register(&self, _id: ShortcutId, _acc: &Accelerator) -> Result<(), RegisterError> {
        Err(RegisterError::new("global shortcuts are not available yet"))
    }

    fn unregister(&self, _id: ShortcutId) {}
}

/// Manages the keyboard service. Called before the windows exist.
pub fn manage(app: &tauri::App) {
    #[cfg(desktop)]
    let registrar: Arc<dyn ShortcutRegistrar> = Arc::new(crate::shortcuts::PluginRegistrar::new(
        crate::shortcuts::AppBackend(app.handle().clone()),
        Arc::clone(&app.state::<Arc<crate::shortcuts::Held>>()),
    ));
    #[cfg(not(desktop))]
    let registrar: Arc<dyn ShortcutRegistrar> = Arc::new(UnavailableRegistrar);
    app.manage(KeyboardService::new(registrar));
}

/// A registered shortcut was pressed (key-down). Runs on a blocking thread.
#[cfg(desktop)]
pub fn pressed(app: &tauri::AppHandle, id: ShortcutId) {
    if let Some(keyboard) = service(app) {
        keyboard.on_pressed(&AppHost::new(app), id);
    }
}

/// Tells the service whether VoiceOver is on (at launch and on change).
#[cfg(target_os = "macos")]
pub fn observe_voice_over(app: &tauri::AppHandle) {
    let app = app.clone();
    orasenda_platform_macos::observe_voice_over(move |on| {
        if let Some(keyboard) = service(&app) {
            keyboard.set_voice_over(&AppHost::new(&app), on);
        }
    });
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
