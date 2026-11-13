//! The global-shortcut plugin: the real [`Backend`] and the plugin with its press handler.

use std::sync::Arc;

use orasenda_service::api::ShortcutId;
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Wry};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use super::{Backend, Held, pressed};

/// Registers with the plugin on the app.
pub struct AppBackend(pub AppHandle);

impl Backend for AppBackend {
    fn register(&self, shortcut: Shortcut) -> Result<(), String> {
        self.0
            .global_shortcut()
            .register(shortcut)
            .map_err(|error| error.to_string())
    }

    fn unregister(&self, shortcut: Shortcut) -> Result<(), String> {
        self.0
            .global_shortcut()
            .unregister(shortcut)
            .map_err(|error| error.to_string())
    }
}

/// The plugin. A key-down of a held shortcut runs its action off the plugin's thread, because
/// the action takes the session lock and may wait on the main thread.
pub fn plugin(held: Arc<Held>) -> TauriPlugin<Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(move |app, shortcut, event| {
            if let Some(id) = pressed(&held, shortcut.id(), event.state()) {
                dispatch(app, id);
            }
        })
        .build()
}

fn dispatch(app: &AppHandle, id: ShortcutId) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::runtime::keyboard::pressed(&app, id));
}
