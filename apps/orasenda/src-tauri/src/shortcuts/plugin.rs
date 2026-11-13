//! The global-shortcut plugin: the real [`Backend`] and the plugin with its press handler.

use std::sync::Arc;

use orasenda_service::keyboard::{ActionId, Source};
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Wry};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

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
            match pressed(&held, shortcut.id(), event.state()) {
                Some(id) => dispatch(app, id),
                // A key-down the plugin heard that no held shortcut owns: it says which key a
                // dead capture press was (bug (b) hands-on check).
                None if event.state() == ShortcutState::Pressed => {
                    eprintln!("shortcuts: key-down {} is not held", shortcut.id());
                }
                None => {}
            }
        })
        .build()
}

/// Every global key goes through `actions::run`, like every other route.
fn dispatch(app: &AppHandle, id: ActionId) {
    crate::actions::run(app, id, Source::Global);
}
