//! The global shortcuts on desktop: the registrar over the global-shortcut plugin and the
//! press handler (spec: Hotkeys and capture, ADR-017).
//!
//! [`PluginRegistrar`] keeps a table of what each [`ActionId`] holds, oldest first, so the
//! contract of [`ShortcutRegistrar`] holds: `register` keeps what the id already holds and
//! `unregister` drops the oldest. The press handler looks a pressed key up in the same table
//! ([`Held`]) and dispatches on key-down only. The plugin itself sits behind [`Backend`], so the
//! logic is tested without the OS.

mod plugin;
#[cfg(test)]
mod tests;

use std::str::FromStr;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use orasenda_service::keyboard::{Accelerator, ActionId, RegisterError, ShortcutRegistrar};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

pub use plugin::{AppBackend, plugin};

/// What the OS side does for one shortcut. Errors are the plugin's words.
pub trait Backend: Send + Sync {
    fn register(&self, shortcut: Shortcut) -> Result<(), String>;
    fn unregister(&self, shortcut: Shortcut) -> Result<(), String>;
}

/// One shortcut an id holds. `live` is false while a recorder listens (the suspension): the
/// OS does not have it then, and `restore` registers it again.
#[derive(Clone, Copy)]
pub(crate) struct Entry {
    pub(crate) id: ActionId,
    pub(crate) shortcut: Shortcut,
    pub(crate) live: bool,
}

#[derive(Default)]
pub(crate) struct HeldState {
    entries: Vec<Entry>,
    /// A recorder listens: nothing registers with the OS for good until `restore`.
    suspended: bool,
}

/// The shortcuts each id holds, oldest first, and whether they are suspended. Shared by the
/// registrar, the press handler and the recording suspension.
#[derive(Default)]
pub struct Held(Mutex<HeldState>);

impl Held {
    fn lock(&self) -> MutexGuard<'_, HeldState> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Starts the suspension. Returns the shortcuts the OS must let go of now.
    pub(crate) fn begin_suspension(&self) -> Vec<Shortcut> {
        let mut held = self.lock();
        held.suspended = true;
        held.entries
            .iter_mut()
            .filter(|e| e.live)
            .map(|e| {
                e.live = false;
                e.shortcut
            })
            .collect()
    }

    /// Ends the suspension. Returns what the OS must take again.
    pub(crate) fn end_suspension(&self) -> Vec<Entry> {
        let mut held = self.lock();
        held.suspended = false;
        held.entries.iter().filter(|e| !e.live).copied().collect()
    }

    /// An entry came back (`ok`), or the OS refused it and it is dropped.
    pub(crate) fn settle(&self, entry: Entry, ok: bool) {
        let mut held = self.lock();
        let at = held
            .entries
            .iter()
            .position(|e| e.id == entry.id && e.shortcut == entry.shortcut && !e.live);
        if let Some(at) = at {
            if ok {
                held.entries[at].live = true;
            } else {
                held.entries.remove(at);
            }
        }
    }

    #[cfg(test)]
    pub(crate) fn insert_for_test(&self, id: ActionId, shortcut: Shortcut) {
        self.lock().entries.push(Entry {
            id,
            shortcut,
            live: true,
        });
    }
}

/// The plugin's shortcut for `acc`, or the plugin's complaint.
pub(crate) fn shortcut_of(acc: &Accelerator) -> Result<Shortcut, String> {
    Shortcut::from_str(&acc.canonical()).map_err(|error| error.to_string())
}

/// The action a key event is for, when it is a key-down of a live held shortcut. A key-up is
/// never a press, and a key nobody holds (or that is suspended) is nothing.
pub(crate) fn pressed(held: &Held, key_id: u32, state: ShortcutState) -> Option<ActionId> {
    if state != ShortcutState::Pressed {
        return None;
    }
    held.lock()
        .entries
        .iter()
        .find(|e| e.live && e.shortcut.id() == key_id)
        .map(|e| e.id)
}

/// The registrar the keyboard service uses on desktop.
pub struct PluginRegistrar<B: Backend> {
    pub(crate) backend: B,
    held: Arc<Held>,
}

impl<B: Backend> PluginRegistrar<B> {
    pub fn new(backend: B, held: Arc<Held>) -> PluginRegistrar<B> {
        PluginRegistrar { backend, held }
    }
}

impl<B: Backend> ShortcutRegistrar for PluginRegistrar<B> {
    fn register(&self, id: ActionId, acc: &Accelerator) -> Result<(), RegisterError> {
        let shortcut = shortcut_of(acc).map_err(RegisterError::new)?;
        // Never hold the table across a backend call: the plugin waits on the main thread,
        // and the press handler on the main thread takes this lock. The keyboard service
        // serialises registrar calls, so the check and the push do not race.
        if self
            .held
            .lock()
            .entries
            .iter()
            .any(|e| e.id == id && e.shortcut == shortcut)
        {
            return Ok(());
        }
        self.backend
            .register(shortcut)
            .map_err(RegisterError::new)?;
        // While a recorder listens the registration is only a probe: the OS lets go again, and
        // `restore` takes the shortcut when recording ends.
        let live = {
            let mut held = self.held.lock();
            let live = !held.suspended;
            held.entries.push(Entry { id, shortcut, live });
            live
        };
        if !live && let Err(error) = self.backend.unregister(shortcut) {
            eprintln!("shortcuts: could not release the probe of {id:?} ({error})");
        }
        Ok(())
    }

    fn unregister(&self, id: ActionId) {
        let entry = {
            let mut held = self.held.lock();
            let Some(at) = held.entries.iter().position(|e| e.id == id) else {
                return;
            };
            held.entries.remove(at)
        };
        if entry.live
            && let Err(error) = self.backend.unregister(entry.shortcut)
        {
            eprintln!("shortcuts: could not unregister {id:?} ({error})");
        }
    }
}
