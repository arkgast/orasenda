//! The keyboard service: the status of both global shortcuts and the changes to them.
//!
//! A change registers the new keys, saves them, unregisters the old keys and emits, in that
//! order. One mutex serializes the changes, so two calls never interleave their registrar calls
//! (newest wins); the session lock is taken only to read and to save, and never held across a
//! registrar call, because registering may reach the main thread.

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use super::{Accelerator, ShortcutId, ShortcutRegistrar, is_menu_shortcut};
use crate::api::{KeyboardError, KeyboardView, Settings, ShortcutStatus, ShortcutView};
use crate::scheduler::{self, Host};
use crate::session::{Action, current_settings, lock, run_action_on};

/// Opens the capture panel. Set by the app; a press of the capture key does nothing before.
pub type CaptureOpener = Arc<dyn Fn() + Send + Sync>;

/// The saved text of a shortcut that is off.
const OFF: &str = "off";

#[derive(Clone, Copy)]
struct Slot {
    /// The saved keys are registered with the OS now.
    live: bool,
    status: ShortcutStatus,
}

struct State {
    slots: [Slot; 2],
    voice_over: bool,
}

fn index(id: ShortcutId) -> usize {
    match id {
        ShortcutId::StartPause => 0,
        ShortcutId::Capture => 1,
    }
}

fn saved_keys(settings: &Settings, id: ShortcutId) -> &str {
    match id {
        ShortcutId::StartPause => &settings.start_pause_keys,
        ShortcutId::Capture => &settings.capture_keys,
    }
}

/// Registers the global shortcuts and keeps their status. Managed once by the app.
pub struct KeyboardService {
    registrar: Arc<dyn ShortcutRegistrar>,
    state: Mutex<State>,
    opener: Mutex<Option<CaptureOpener>>,
}

impl KeyboardService {
    /// Nothing is registered yet: call [`KeyboardService::register_saved`] once the store is open.
    pub fn new(registrar: Arc<dyn ShortcutRegistrar>) -> KeyboardService {
        let off = Slot {
            live: false,
            status: ShortcutStatus::Off,
        };
        KeyboardService {
            registrar,
            state: Mutex::new(State {
                slots: [off, off],
                voice_over: false,
            }),
            opener: Mutex::new(None),
        }
    }

    fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// What the capture key does (set by the capture panel's task).
    pub fn set_capture_opener(&self, opener: CaptureOpener) {
        *self.opener.lock().unwrap_or_else(PoisonError::into_inner) = Some(opener);
    }

    /// The webview's view: the saved keys, the status and the single-key setting.
    pub fn view<H: Host>(&self, host: &H) -> KeyboardView {
        let settings = current_settings(host);
        view_of(&self.state(), &settings)
    }

    /// The launch registration of the saved shortcuts. Writes nothing: a shortcut that fails is
    /// `Failed` (and shown so), one that is off is `Off`. Emits `keyboard-changed`.
    pub fn register_saved<H: Host>(&self, host: &H) {
        let settings = current_settings(host);
        let (view, now_usable) = {
            let mut state = self.state();
            for id in [ShortcutId::StartPause, ShortcutId::Capture] {
                let slot = &mut state.slots[index(id)];
                if slot.live {
                    self.registrar.unregister(id);
                }
                *slot = self.register_one(id, saved_keys(&settings, id));
            }
            (view_of(&state, &settings), usable(&state))
        };
        sync_tips(host, now_usable);
        host.emit_keyboard_changed(&view);
    }

    fn register_one(&self, id: ShortcutId, keys: &str) -> Slot {
        let failed = Slot {
            live: false,
            status: ShortcutStatus::Failed,
        };
        if keys == OFF {
            return Slot {
                live: false,
                status: ShortcutStatus::Off,
            };
        }
        match Accelerator::parse(keys) {
            Err(error) => {
                eprintln!("keyboard: the saved {id:?} keys {keys:?} are not a shortcut ({error})");
                failed
            }
            Ok(acc) => match self.registrar.register(id, &acc) {
                Ok(()) => Slot {
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

    /// Changes a shortcut; `None` turns it off. Parse, refuse a clash, register the new keys,
    /// save, unregister the old keys, emit. A refused change saves nothing and leaves the old
    /// shortcut as it was.
    pub fn set_shortcut<H: Host>(
        &self,
        host: &H,
        id: ShortcutId,
        keys: Option<String>,
    ) -> Result<KeyboardView, KeyboardError> {
        let wanted = match keys.as_deref().map(Accelerator::parse).transpose() {
            Ok(wanted) => wanted,
            Err(_) => return Err(KeyboardError::Invalid),
        };
        let mut state = self.state();
        let settings = current_settings(host);
        if let Some(acc) = &wanted
            && self.clashes(acc, id, &settings)
        {
            return Err(KeyboardError::InUseByOrasenda);
        }
        let text = wanted
            .as_ref()
            .map_or_else(|| OFF.to_string(), Accelerator::canonical);
        let slot = state.slots[index(id)];
        let unchanged = saved_keys(&settings, id) == text;
        if unchanged && (slot.live || wanted.is_none()) {
            return Ok(view_of(&state, &settings));
        }
        // `old_live`: the saved keys are registered and stay so until the new ones are saved.
        let old_live = slot.live && !unchanged;
        if let Some(acc) = &wanted
            && let Err(error) = self.registrar.register(id, acc)
        {
            eprintln!("keyboard: {id:?} {text} was not registered ({error})");
            return Err(KeyboardError::Unavailable);
        }
        let (saved, changed) = save(host, id, &text);
        let presented = match saved {
            Ok(presented) => presented,
            Err(error) => {
                eprintln!("keyboard: {id:?} could not be saved ({error})");
                self.roll_back(&mut state, id, &settings, wanted.is_some(), old_live);
                let now_usable = usable(&state);
                drop(state);
                sync_tips(host, now_usable);
                publish(host, changed);
                return Err(KeyboardError::Store);
            }
        };
        if old_live || (wanted.is_none() && slot.live) {
            self.registrar.unregister(id);
        }
        state.slots[index(id)] = match wanted {
            Some(_) => Slot {
                live: true,
                status: ShortcutStatus::Registered,
            },
            None => Slot {
                live: false,
                status: ShortcutStatus::Off,
            },
        };
        let view = view_of(&state, &presented);
        let now_usable = usable(&state);
        drop(state);
        sync_tips(host, now_usable);
        // After the state lock is released: rendering the tray reads the keyboard status.
        publish(host, changed);
        host.emit_keyboard_changed(&view);
        host.emit_settings_changed(&presented);
        Ok(view)
    }

    /// The save failed after the new keys registered: leave only the old keys registered.
    fn roll_back(
        &self,
        state: &mut State,
        id: ShortcutId,
        settings: &Settings,
        registered_new: bool,
        old_live: bool,
    ) {
        if !registered_new {
            return;
        }
        self.registrar.unregister(id);
        if !old_live {
            return;
        }
        // Two were registered and a second unregister drops the oldest: the first call dropped
        // the old keys, this one drops the new keys, and the old keys are registered again (which
        // can fail, and then the status is Failed).
        self.registrar.unregister(id);
        state.slots[index(id)] = self.register_one(id, saved_keys(settings, id));
    }

    /// Whether `acc` is the other global shortcut's keys or an app menu shortcut.
    fn clashes(&self, acc: &Accelerator, id: ShortcutId, settings: &Settings) -> bool {
        is_menu_shortcut(acc)
            || Accelerator::parse(saved_keys(settings, id.other())).as_ref() == Ok(acc)
    }

    /// Sets a shortcut back to its default, by the same path as a change.
    pub fn restore_default<H: Host>(
        &self,
        host: &H,
        id: ShortcutId,
    ) -> Result<KeyboardView, KeyboardError> {
        self.set_shortcut(host, id, Some(id.default_keys().to_string()))
    }

    /// A registered shortcut was pressed (on press only). ⌃⌥F goes through the session lock and
    /// newest-wins like the menu items; the capture key calls the opener.
    pub fn on_pressed<H: Host>(&self, host: &H, id: ShortcutId) {
        match id {
            ShortcutId::StartPause => {
                if let Err(error) = run_action_on(host, Action::StartPauseToggle) {
                    eprintln!(
                        "keyboard: the start or pause key failed ({})",
                        error.message
                    );
                }
            }
            ShortcutId::Capture => {
                let opener = self
                    .opener
                    .lock()
                    .unwrap_or_else(PoisonError::into_inner)
                    .clone();
                if let Some(open) = opener {
                    open();
                }
            }
        }
    }

    /// Whether VoiceOver is on (fed by the platform); emits `keyboard-changed` when it changed.
    pub fn set_voice_over<H: Host>(&self, host: &H, on: bool) {
        let settings = current_settings(host);
        let (view, now_usable) = {
            let mut state = self.state();
            if state.voice_over == on {
                return;
            }
            state.voice_over = on;
            (view_of(&state, &settings), usable(&state))
        };
        sync_tips(host, now_usable);
        host.emit_keyboard_changed(&view);
    }
}

pub fn shortcut_view(keys: &str, status: ShortcutStatus) -> ShortcutView {
    let parsed = (keys != OFF)
        .then(|| Accelerator::parse(keys).ok())
        .flatten();
    ShortcutView {
        keys: (keys != OFF).then(|| keys.to_string()),
        display: parsed.as_ref().map(Accelerator::describe),
        spoken: parsed.as_ref().map(Accelerator::spoken),
        status,
    }
}

/// The start or pause shortcut works now: registered, and VoiceOver is not taking ⌃⌥ keys.
fn usable(state: &State) -> bool {
    state.slots[index(ShortcutId::StartPause)].status == ShortcutStatus::Registered
        && !state.voice_over
}

/// Tells the session whether the shortcut tip may name the keys (it picks the tip's variant).
fn sync_tips<H: Host>(host: &H, usable: bool) {
    if let Some(service) = host.service() {
        lock(service).set_shortcut_usable(usable);
    }
}

fn view_of(state: &State, settings: &Settings) -> KeyboardView {
    let of =
        |id: ShortcutId| shortcut_view(saved_keys(settings, id), state.slots[index(id)].status);
    KeyboardView {
        start_pause: of(ShortcutId::StartPause),
        capture: of(ShortcutId::Capture),
        single_key: settings.single_key,
        voice_over: state.voice_over,
    }
}

type Changed = Option<(u64, crate::api::TimerView)>;

/// Saves the keys under the session lock. Returns the presented settings and, when the save
/// moved the store status, the view to publish. The caller publishes it with no keyboard lock
/// held, because rendering the tray reads the keyboard status.
fn save<H: Host>(host: &H, id: ShortcutId, text: &str) -> (Result<Settings, String>, Changed) {
    let Some(service) = host.service() else {
        return (Err("Orasenda is still starting".into()), None);
    };
    let now_ms = host.now_ms();
    let mut service = lock(service);
    let before = service.store_status();
    let result = service.save_shortcut_keys(id, text, now_ms);
    let changed = (service.store_status() != before).then(|| service.snapshot(now_ms));
    (result.map_err(|error| error.to_string()), changed)
}

fn publish<H: Host>(host: &H, changed: Changed) {
    if let Some((seq, view)) = changed {
        scheduler::publish_view(host, seq, &view);
    }
}
