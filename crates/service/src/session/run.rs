//! The free functions the commands and the scheduler call, over any [`Host`].

use std::panic::{self, AssertUnwindSafe};
use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};

use orasenda_core::{NotificationStatus, PresetId, SessionId, default_presets};
use orasenda_store::{OpenError, Store};
use uuid::Uuid;

use super::*;
use crate::api::{
    PresetEntry, PresetError, PresetErrorKind, PresetPatch, Settings, SettingsError,
    SettingsErrorKind, StoreStatus, TimerCommandError, TimerCommandErrorKind, TimerState,
    TimerView, entries,
};
use crate::data::PendingOutcome;
use crate::scheduler::{self, Host};

/// The data file in the app data dir.
pub(crate) const DB_FILE: &str = "orasenda.db";

/// Locks the service. A poisoned lock is recovered: every write is one transaction, so the
/// service is consistent even after a panic in another holder.
pub fn lock(service: &Mutex<SessionService>) -> MutexGuard<'_, SessionService> {
    service.lock().unwrap_or_else(PoisonError::into_inner)
}

pub(super) fn new_session_id() -> SessionId {
    SessionId(Uuid::now_v7().to_string())
}

/// Creates `dir` (SQLite does not create parent directories) and opens `orasenda.db` in it.
pub fn open_store_at(dir: &Path, new_device_id: &str) -> Result<Store, OpenError> {
    std::fs::create_dir_all(dir).map_err(|error| OpenError::Io(error.to_string()))?;
    // A staged Restore or Delete all data lands before the store opens.
    let outcome = crate::data::pending::apply_pending(dir);
    let store = Store::open(&dir.join(DB_FILE), new_device_id)?;
    if outcome == PendingOutcome::Restored {
        // The backup may hold a live session of another run; none resumes. Clearing writes no
        // change_log row, so the clock (0 here) is never ticked.
        store
            .write(0, orasenda_store::active_session::clear)
            .map_err(|error| OpenError::Sqlite(error.to_string()))?;
    }
    Ok(store)
}

/// Runs `action` for a surface: lock, apply, unlock, publish (always, success or error),
/// return. Called on a `spawn_blocking` thread, never on the main thread.
pub fn run_action_on<H: Host>(host: &H, action: Action) -> Result<TimerView, TimerCommandError> {
    let Some(service) = host.service() else {
        return Err(TimerCommandError {
            kind: TimerCommandErrorKind::Store,
            message: "Orasenda is still starting".into(),
        });
    };
    let effects = lock(service).apply(action, host.now_ms(), new_session_id);
    // Taken first: the action is committed whatever happens while publishing.
    let result = effects.result.clone();
    scheduler::publish_caught(host, effects);
    result
}

/// `timer_state`: advance, publish, return the view and the drained `pending`. Idle before
/// the service exists.
pub fn run_state<H: Host>(host: &H) -> TimerState {
    let Some(service) = host.service() else {
        return TimerState {
            view: TimerView::idle(StoreStatus::Unavailable, NotificationStatus::Unavailable),
            pending: Vec::new(),
        };
    };
    // `pending` is already drained into `state`, so a panic while publishing must not lose it.
    let (state, effects) = lock(service).state(host.now_ms());
    scheduler::publish_caught(host, effects);
    state
}

/// `settings_set`: validate and write under the lock, then, after unlock and in this order:
/// apply the theme when it changed, publish one `timer-tick` when the save changed the store
/// status (its write fails, or it also writes what was owed; even while idle, so the standing
/// store line follows `view.store`, #112), publish one `clock-tick` so the idle finish follows
/// the new preset at once, and emit `settings-changed`. A failed save does only the
/// `timer-tick` part.
pub fn run_set_settings<H: Host>(host: &H, settings: Settings) -> Result<(), SettingsError> {
    let Some(service) = host.service() else {
        return Err(SettingsError {
            kind: SettingsErrorKind::Unavailable,
            message: "settings can't be saved right now".into(),
        });
    };
    let now_ms = host.now_ms();
    let (result, changed) = {
        let mut service = lock(service);
        let before = service.store_status;
        let result = service.set_settings(settings, now_ms);
        let changed = (service.store_status != before).then(|| service.snapshot(now_ms));
        (result, changed)
    };
    publish_settings_saved(host, &result, changed);
    result?;
    Ok(())
}

/// What a settings save does after unlock, in this order: apply the theme when it changed, a
/// `timer-tick` when the store status changed, a `clock-tick`, then `settings-changed`. Only
/// the `timer-tick` part follows a failed save. The save is committed, so a panic here is
/// logged and never turned into a failure.
fn publish_settings_saved<H: Host, E>(
    host: &H,
    result: &Result<SettingsSaved, E>,
    changed: Option<(u64, TimerView)>,
) {
    let published = panic::catch_unwind(AssertUnwindSafe(|| {
        if let Ok(saved) = result
            && let Some(theme) = saved.theme
        {
            host.apply_theme(theme);
        }
        if let Some((seq, view)) = changed {
            scheduler::publish_view(host, seq, &view);
        }
        if let Ok(saved) = result {
            scheduler::publish_clock(host);
            host.emit_settings_changed(&saved.presented);
        }
    }));
    if published.is_err() {
        eprintln!("session: publishing a settings save panicked; its result stands");
    }
}

/// `settings_get`: the cached settings under a brief lock; defaults before setup.
pub fn current_settings<H: Host>(host: &H) -> Settings {
    host.service()
        .map(|service| lock(service).settings())
        .unwrap_or_default()
}

/// The `RunEvent::Exit` flush: a last attempt to write anything owed.
pub fn flush_on_exit<H: Host>(host: &H) {
    if let Some(service) = host.service() {
        lock(service).flush(host.now_ms());
    }
}

/// `timer_view`: the current view under a brief lock. No tick, no publish, and it neither
/// drains `pending` nor sets `listening`, so a Focus window or floater can read it without
/// taking what only `timer_state` (Today) hands out. Idle before setup.
pub fn run_view<H: Host>(host: &H) -> TimerView {
    match host.service() {
        Some(service) => lock(service).view(host.now_ms()),
        None => TimerView::idle(StoreStatus::Unavailable, NotificationStatus::Unavailable),
    }
}

/// `presets_list`: the live presets under a brief lock; core's defaults before setup.
pub fn run_presets_list<H: Host>(host: &H) -> Vec<PresetEntry> {
    match host.service() {
        Some(service) => lock(service).presets(),
        None => entries(&default_presets()),
    }
}

/// `preset_select`: saves the library preset `id` as the chosen preset while idle. Checks idle and saves under
/// one lock, so a start can't slip between them; then does what `settings_set` does after
/// unlock. `WrongState` while a session runs or is paused, `InvalidSpec` for an id that is not in
/// the library, `Store` when the save fails.
pub fn run_select_preset<H: Host>(host: &H, id: PresetId) -> Result<(), TimerCommandError> {
    let Some(service) = host.service() else {
        return Err(TimerCommandError {
            kind: TimerCommandErrorKind::Store,
            message: "Orasenda is still starting".into(),
        });
    };
    let now_ms = host.now_ms();
    let (result, changed) = {
        let mut service = lock(service);
        if !service.engine.is_idle() {
            return Err(TimerCommandError {
                kind: TimerCommandErrorKind::WrongState,
                message: "the preset can be chosen when no session is running".into(),
            });
        }
        let before = service.store_status;
        let chosen = Settings {
            preset_id: id,
            ..service.settings()
        };
        let result = service.set_settings(chosen, now_ms);
        let changed = (service.store_status != before).then(|| service.snapshot(now_ms));
        (result, changed)
    };
    publish_settings_saved(host, &result, changed);
    result.map(|_| ()).map_err(|error| TimerCommandError {
        kind: match error.kind {
            SettingsErrorKind::InvalidSpec => TimerCommandErrorKind::InvalidSpec,
            _ => TimerCommandErrorKind::Store,
        },
        message: error.message,
    })
}

/// What an edit of the library publishes after unlock, in this order: `presets-changed` (the
/// surfaces too), the view, and, when the selection moved, a `clock-tick` and
/// `settings-changed`. The edit is committed, so a panic here is logged, never a failure.
fn publish_presets_saved<H: Host, T>(
    host: &H,
    result: &Result<presets::edit::Edited, T>,
    view: Option<(u64, TimerView)>,
) {
    let published = panic::catch_unwind(AssertUnwindSafe(|| {
        let Ok(edited) = result else {
            return;
        };
        host.emit_presets_changed(&edited.presets);
        if let Some((seq, view)) = view {
            scheduler::publish_view(host, seq, &view);
        }
        if let Some(settings) = &edited.selection_moved {
            scheduler::publish_clock(host);
            host.emit_settings_changed(settings);
        }
    }));
    if published.is_err() {
        eprintln!("session: publishing a preset edit panicked; its result stands");
    }
}

fn run_preset_edit<H: Host>(
    host: &H,
    apply: impl FnOnce(&mut SessionService, u64) -> Result<presets::edit::Edited, PresetError>,
) -> Result<presets::edit::Edited, PresetError> {
    let Some(service) = host.service() else {
        return Err(PresetError {
            kind: PresetErrorKind::Unavailable,
            field: None,
            message: "presets can't be changed right now".into(),
        });
    };
    let now_ms = host.now_ms();
    let (result, view) = {
        let mut service = lock(service);
        let result = apply(&mut service, now_ms);
        let view = result.is_ok().then(|| service.snapshot(now_ms));
        (result, view)
    };
    publish_presets_saved(host, &result, view);
    result
}

/// `preset_add`: adds "New preset" and returns it.
pub fn run_preset_add<H: Host>(host: &H) -> Result<PresetEntry, PresetError> {
    run_preset_edit(host, |s, now| s.preset_add(now)).and_then(entry_of)
}

/// `preset_update`: changes the given fields and returns the preset.
pub fn run_preset_update<H: Host>(
    host: &H,
    id: PresetId,
    patch: PresetPatch,
) -> Result<PresetEntry, PresetError> {
    run_preset_edit(host, |s, now| s.preset_update(&id, patch, now)).and_then(entry_of)
}

/// `preset_remove`: removes the preset and returns the live list.
pub fn run_preset_remove<H: Host>(host: &H, id: PresetId) -> Result<Vec<PresetEntry>, PresetError> {
    run_preset_edit(host, |s, now| s.preset_remove(&id, now)).map(|e| e.presets)
}

/// `preset_undo_remove`: brings a removed preset back and returns the live list.
pub fn run_preset_undo_remove<H: Host>(
    host: &H,
    id: PresetId,
) -> Result<Vec<PresetEntry>, PresetError> {
    run_preset_edit(host, |s, now| s.preset_undo_remove(&id, now)).map(|e| e.presets)
}

/// `presets_restore_defaults`: restores the three defaults and returns the live list.
pub fn run_presets_restore_defaults<H: Host>(host: &H) -> Result<Vec<PresetEntry>, PresetError> {
    run_preset_edit(host, |s, now| s.presets_restore_defaults(now)).map(|e| e.presets)
}

fn entry_of(edited: presets::edit::Edited) -> Result<PresetEntry, PresetError> {
    edited.entry.ok_or(PresetError {
        kind: PresetErrorKind::NotFound,
        field: None,
        message: "that preset is gone".into(),
    })
}
