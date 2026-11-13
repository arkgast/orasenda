//! The global shortcuts in the app: the keyboard service in managed state and the registrar it
//! uses. On desktop that is the global-shortcut plugin ([`crate::shortcuts`]). Elsewhere
//! [`UnavailableRegistrar`] refuses every registration, so a shortcut reports `failed` and a
//! change reports `unavailable`, never a success that did nothing.

use std::sync::Arc;

use orasenda_service::api::{KeyboardError, KeyboardView};
#[cfg(not(desktop))]
use orasenda_service::keyboard::{Accelerator, RegisterError};
use orasenda_service::keyboard::{
    ActionId, KeyboardService, ShortcutRegistrar, Slot, default_view,
};
use tauri::{Manager, State};

use crate::runtime::ticker::AppHost;

/// Registers nothing and says so. Used where there is no global-shortcut plugin (mobile).
#[cfg(not(desktop))]
pub struct UnavailableRegistrar;

#[cfg(not(desktop))]
impl ShortcutRegistrar for UnavailableRegistrar {
    fn register(&self, _id: ActionId, _acc: &Accelerator) -> Result<(), RegisterError> {
        Err(RegisterError::new("global shortcuts are not available yet"))
    }

    fn unregister(&self, _id: ActionId) {}
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

/// Tells the service whether VoiceOver is on (at launch and on change).
#[cfg(target_os = "macos")]
pub fn observe_voice_over(app: &tauri::AppHandle) {
    let app = app.clone();
    orasenda_platform_macos::observe_voice_over(move |on| {
        // This runs on the main thread. No main-thread callback may take the keyboard lock,
        // because registering a shortcut holds it while waiting on the main thread.
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            if let Some(keyboard) = service(&app) {
                keyboard.set_voice_over(&AppHost::new(&app), on);
            }
        });
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

/// `keyboard_state` on the app. Before setup: the defaults, nothing registered.
pub fn state(app: &tauri::AppHandle) -> KeyboardView {
    match service(app) {
        Some(keyboard) => keyboard.view(&AppHost::new(app)),
        None => default_view(),
    }
}

/// `keyboard_set_binding` on the app.
pub fn set_binding(
    app: &tauri::AppHandle,
    id: ActionId,
    slot: Slot,
    keys: Option<String>,
    confirm_warning: bool,
) -> Result<KeyboardView, KeyboardError> {
    let keyboard = service(app).ok_or(KeyboardError::Unavailable)?;
    keyboard.set_binding(&AppHost::new(app), id, slot, keys, confirm_warning)
}

/// `keyboard_restore_default` on the app.
pub fn restore_default(
    app: &tauri::AppHandle,
    id: ActionId,
    slot: Slot,
) -> Result<KeyboardView, KeyboardError> {
    let keyboard = service(app).ok_or(KeyboardError::Unavailable)?;
    keyboard.restore_default(&AppHost::new(app), id, slot)
}
