//! The free functions the commands and the scheduler call, over any [`Host`].

use std::panic::{self, AssertUnwindSafe};
use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};

use orasenda_core::{NotificationStatus, SessionId};
use orasenda_store::{OpenError, Store};
use uuid::Uuid;

use super::*;
use crate::api::{
    Settings, SettingsError, SettingsErrorKind, StoreStatus, TimerCommandError,
    TimerCommandErrorKind, TimerState, TimerView,
};
use crate::scheduler::{self, Host};

const DB_FILE: &str = "orasenda.db";

/// Locks the service. A poisoned lock is recovered: every write is one transaction, so the
/// service is consistent even after a panic in another holder.
pub fn lock(service: &Mutex<SessionService>) -> MutexGuard<'_, SessionService> {
    service.lock().unwrap_or_else(PoisonError::into_inner)
}

fn new_session_id() -> SessionId {
    SessionId(Uuid::now_v7().to_string())
}

/// Creates `dir` (SQLite does not create parent directories) and opens `orasenda.db` in it.
pub fn open_store_at(dir: &Path, new_device_id: &str) -> Result<Store, OpenError> {
    std::fs::create_dir_all(dir).map_err(|error| OpenError::Io(error.to_string()))?;
    Store::open(&dir.join(DB_FILE), new_device_id)
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
    // The save is committed: a panic while publishing is logged, never turned into a failure.
    let published = panic::catch_unwind(AssertUnwindSafe(|| {
        if let Ok(saved) = &result
            && let Some(theme) = saved.theme
        {
            host.apply_theme(theme);
        }
        if let Some((seq, view)) = changed {
            scheduler::publish_view(host, seq, &view);
        }
        if let Ok(saved) = &result {
            scheduler::publish_clock(host);
            host.emit_settings_changed(&saved.presented);
        }
    }));
    if published.is_err() {
        eprintln!("session: publishing a settings save panicked; its result stands");
    }
    result?;
    Ok(())
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
