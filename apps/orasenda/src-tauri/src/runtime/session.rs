//! The session in the app: the Tauri glue around `orasenda-service`'s session (ADR-013).
//! The service, its types and the free functions come from the service crate unchanged; this
//! file adds the setup and the `AppHandle` entry point.

use std::error::Error;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::SystemTime;

use orasenda_core::clock::epoch_ms;
use orasenda_service::api::{
    PresetEntry, Settings, SettingsError, TimerCommandError, TimerState, TimerView,
};
use orasenda_store::OpenError;
use tauri::Manager;
use uuid::Uuid;

pub use orasenda_service::session::*;

use crate::runtime::ticker::{self as scheduler, AppHost};

/// The wall clock in epoch milliseconds: the only place the app reads it.
pub fn now_ms() -> u64 {
    epoch_ms(SystemTime::now())
}

/// Opens the store, builds the service and starts the launch read of the notification
/// status on its own thread, so `Notifier::status` never blocks the main thread.
pub fn setup(app: &tauri::App) -> Result<(), Box<dyn Error>> {
    let store = match app.path().app_data_dir() {
        Ok(dir) => open_store_at(&dir, &Uuid::new_v4().to_string()),
        Err(error) => Err(OpenError::Io(error.to_string())),
    };
    let platform = crate::platform::current();
    let notifier = Arc::clone(&platform.notifier);
    app.manage(Mutex::new(SessionService::new(store, platform, now_ms())));
    app.manage(notifier);
    app.manage(ViewGate::default());
    let host = AppHost::new(app.handle());
    thread::Builder::new()
        .name("notification-status".into())
        .spawn(move || scheduler::read_launch_status(&host))?;
    Ok(())
}

/// Runs `action` for a surface: lock, apply, unlock, publish (always, success or error),
/// return. Called on a `spawn_blocking` thread, never on the main thread.
pub fn run_action(app: &tauri::AppHandle, action: Action) -> Result<TimerView, TimerCommandError> {
    run_action_on(&AppHost::new(app), action)
}

/// `timer_state` on the app.
pub fn run_state(app: &tauri::AppHandle) -> TimerState {
    orasenda_service::session::run_state(&AppHost::new(app))
}

/// `timer_view` on the app: the view without draining milestones.
pub fn run_view(app: &tauri::AppHandle) -> TimerView {
    orasenda_service::session::run_view(&AppHost::new(app))
}

/// `preset_select` on the app: a library preset id, saved while idle.
pub fn run_select_preset(app: &tauri::AppHandle, id: String) -> Result<(), TimerCommandError> {
    orasenda_service::session::run_select_preset(&AppHost::new(app), orasenda_core::PresetId(id))
}

/// `settings_set` on the app.
pub fn run_set_settings(app: &tauri::AppHandle, settings: Settings) -> Result<(), SettingsError> {
    orasenda_service::session::run_set_settings(&AppHost::new(app), settings)
}

/// `presets_list` on the app.
pub fn run_presets_list(app: &tauri::AppHandle) -> Vec<PresetEntry> {
    orasenda_service::session::run_presets_list(&AppHost::new(app))
}

/// `settings_get` on the app.
pub fn current_settings(app: &tauri::AppHandle) -> Settings {
    orasenda_service::session::current_settings(&AppHost::new(app))
}

/// The `RunEvent::Exit` flush on the app.
pub fn flush_on_exit(app: &tauri::AppHandle) {
    orasenda_service::session::flush_on_exit(&AppHost::new(app));
}
