//! The global shortcuts on desktop: the registrar over the global-shortcut plugin and the
//! press handler (spec: Hotkeys and capture, ADR-017).
//!
//! [`PluginRegistrar`] keeps a table of what each [`ShortcutId`] holds, oldest first, so the
//! contract of [`ShortcutRegistrar`] holds: `register` keeps what the id already holds and
//! `unregister` drops the oldest. The press handler looks a pressed key up in the same table
//! ([`Held`]) and dispatches on key-down only. The plugin itself sits behind [`Backend`], so the
//! logic is tested without the OS.

mod plugin;
#[cfg(test)]
mod tests;

use std::str::FromStr;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use orasenda_service::api::ShortcutId;
use orasenda_service::keyboard::{Accelerator, RegisterError, ShortcutRegistrar};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

pub use plugin::{AppBackend, plugin};

/// What the OS side does for one shortcut. Errors are the plugin's words.
pub trait Backend: Send + Sync {
    fn register(&self, shortcut: Shortcut) -> Result<(), String>;
    fn unregister(&self, shortcut: Shortcut) -> Result<(), String>;
}

/// The shortcuts each id holds, oldest first. Shared by the registrar and the press handler.
#[derive(Default)]
pub struct Held(Mutex<Vec<(ShortcutId, Shortcut)>>);

impl Held {
    fn lock(&self) -> MutexGuard<'_, Vec<(ShortcutId, Shortcut)>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// The plugin's shortcut for `acc`, or the plugin's complaint.
pub(crate) fn shortcut_of(acc: &Accelerator) -> Result<Shortcut, String> {
    Shortcut::from_str(&acc.canonical()).map_err(|error| error.to_string())
}

/// The shortcut a key event is for, when it is a key-down of a held one. A key-up is never
/// a press, and a key nobody holds is nothing.
pub(crate) fn pressed(held: &Held, key_id: u32, state: ShortcutState) -> Option<ShortcutId> {
    if state != ShortcutState::Pressed {
        return None;
    }
    held.lock()
        .iter()
        .find(|(_, shortcut)| shortcut.id() == key_id)
        .map(|(id, _)| *id)
}

/// The registrar the keyboard service uses on desktop.
pub struct PluginRegistrar<B: Backend> {
    backend: B,
    held: Arc<Held>,
}

impl<B: Backend> PluginRegistrar<B> {
    pub fn new(backend: B, held: Arc<Held>) -> PluginRegistrar<B> {
        PluginRegistrar { backend, held }
    }
}

impl<B: Backend> ShortcutRegistrar for PluginRegistrar<B> {
    fn register(&self, id: ShortcutId, acc: &Accelerator) -> Result<(), RegisterError> {
        let shortcut = shortcut_of(acc).map_err(RegisterError::new)?;
        let mut held = self.held.lock();
        if held.iter().any(|(i, s)| *i == id && *s == shortcut) {
            return Ok(());
        }
        self.backend
            .register(shortcut)
            .map_err(RegisterError::new)?;
        held.push((id, shortcut));
        Ok(())
    }

    fn unregister(&self, id: ShortcutId) {
        let mut held = self.held.lock();
        let Some(at) = held.iter().position(|(i, _)| *i == id) else {
            return;
        };
        let (_, shortcut) = held.remove(at);
        if let Err(error) = self.backend.unregister(shortcut) {
            eprintln!("shortcuts: could not unregister {id:?} ({error})");
        }
    }
}
