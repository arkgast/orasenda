//! The keyboard service: the status of the *Everywhere* shortcuts and the launch registration.
//!
//! Binding changes are in `binding.rs`. One state mutex serializes every change, so two calls
//! never interleave their registrar calls (newest wins); the session lock is taken only to read
//! and to save, and never held across a registrar call, because registering may reach the main
//! thread.

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use super::view::{Rows, effective, read_rows, view_from, view_of};
use super::{Accelerator, ActionId, ShortcutRegistrar, Slot};
use crate::api::{KeyboardView, ShortcutStatus};
use crate::scheduler::Host;
use crate::session::lock;

#[derive(Clone, Copy)]
pub(super) struct Live {
    /// The saved keys are registered with the OS now.
    pub(super) live: bool,
    pub(super) status: ShortcutStatus,
}

pub(super) struct State {
    pub(super) slots: [Live; 6],
    pub(super) voice_over: bool,
}

impl State {
    pub(super) fn statuses(&self) -> Vec<ShortcutStatus> {
        self.slots.iter().map(|s| s.status).collect()
    }
}

/// Registers the *Everywhere* shortcuts and keeps their status. Managed once by the app.
pub struct KeyboardService {
    pub(super) registrar: Arc<dyn ShortcutRegistrar>,
    pub(super) state: Mutex<State>,
}

impl KeyboardService {
    /// Nothing is registered yet: call [`KeyboardService::register_saved`] once the store is open.
    pub fn new(registrar: Arc<dyn ShortcutRegistrar>) -> KeyboardService {
        let off = Live {
            live: false,
            status: ShortcutStatus::Off,
        };
        KeyboardService {
            registrar,
            state: Mutex::new(State {
                slots: [off; 6],
                voice_over: false,
            }),
        }
    }

    pub(super) fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// The registry as the webview sees it. Without a store it shows the defaults.
    pub fn view<H: Host>(&self, host: &H) -> KeyboardView {
        let rows = read_rows(host).unwrap_or_default();
        view_of_state(host, &self.state(), &rows)
    }

    /// The launch registration. Folds the legacy keys (once per device), repairs clashes, then
    /// registers every saved *Everywhere* binding. A shortcut that fails is `Failed` (and shown
    /// so); one that is off is `Off`. Emits `keyboard-changed`.
    pub fn register_saved<H: Host>(&self, host: &H) {
        fold_and_repair(host);
        let rows = read_rows(host).unwrap_or_default();
        let (view, now_usable) = {
            let mut state = self.state();
            for id in ActionId::ALL {
                let slot = &mut state.slots[id.index()];
                if slot.live {
                    self.registrar.unregister(id);
                }
                *slot = self.register_one(id, effective(&rows, id, Slot::Global).as_deref());
            }
            (view_of_state(host, &state, &rows), usable(&state))
        };
        sync_tips(host, now_usable);
        host.emit_keyboard_changed(&view);
    }

    pub(super) fn register_one(&self, id: ActionId, keys: Option<&str>) -> Live {
        let failed = Live {
            live: false,
            status: ShortcutStatus::Failed,
        };
        let Some(keys) = keys else {
            return Live {
                live: false,
                status: ShortcutStatus::Off,
            };
        };
        match Accelerator::parse(keys) {
            Err(error) => {
                eprintln!("keyboard: the saved {id:?} keys {keys:?} are not a shortcut ({error})");
                failed
            }
            Ok(acc) => match self.registrar.register(id, &acc) {
                Ok(()) => Live {
                    live: true,
                    status: ShortcutStatus::Registered,
                },
                Err(error) => {
                    eprintln!("keyboard: {id:?} {keys} was not registered ({error})");
                    failed
                }
            },
        }
    }

    /// The shortcuts in `ids` stopped working after they were registered (a restore after a
    /// recording failed): they show as `Failed`. Emits `keyboard-changed`.
    pub fn mark_failed<H: Host>(&self, host: &H, ids: &[ActionId]) {
        let rows = read_rows(host).unwrap_or_default();
        let (view, now_usable) = {
            let mut state = self.state();
            for id in ids {
                state.slots[id.index()] = Live {
                    live: false,
                    status: ShortcutStatus::Failed,
                };
            }
            (view_of_state(host, &state, &rows), usable(&state))
        };
        sync_tips(host, now_usable);
        host.emit_keyboard_changed(&view);
    }

    /// Whether VoiceOver is on (fed by the platform); emits `keyboard-changed` when it changed.
    pub fn set_voice_over<H: Host>(&self, host: &H, on: bool) {
        let rows = read_rows(host).unwrap_or_default();
        let (view, now_usable) = {
            let mut state = self.state();
            if state.voice_over == on {
                return;
            }
            state.voice_over = on;
            (view_of_state(host, &state, &rows), usable(&state))
        };
        sync_tips(host, now_usable);
        host.emit_keyboard_changed(&view);
    }
}

/// The registry with every default and nothing registered: what the menus start from, before the
/// store is read.
pub fn default_view() -> KeyboardView {
    let off = [ShortcutStatus::Off; 6];
    view_from(&Rows::new(), &off, true, false)
}

pub(super) fn view_of_state<H: Host>(host: &H, state: &State, rows: &Rows) -> KeyboardView {
    view_of(host, rows, &state.statuses(), state.voice_over)
}

/// Fold (once per device) then repair, in one write. A failure is logged: the saved rows are
/// registered as they are.
fn fold_and_repair<H: Host>(host: &H) {
    let Some(service) = host.service() else {
        return;
    };
    let now_ms = host.now_ms();
    if let Err(error) = lock(service).fold_and_repair_keys(now_ms) {
        eprintln!("keyboard: could not fold and repair the saved keys ({error})");
    }
}

/// The start or pause shortcut works now: registered, and VoiceOver is not taking ⌃⌥ keys.
pub(super) fn usable(state: &State) -> bool {
    state.slots[ActionId::StartPause.index()].status == ShortcutStatus::Registered
        && !state.voice_over
}

/// Tells the session whether the shortcut tip may name the keys (it picks the tip's variant).
pub(super) fn sync_tips<H: Host>(host: &H, usable: bool) {
    if let Some(service) = host.service() {
        lock(service).set_shortcut_usable(usable);
    }
}
