//! Tauri commands. Each one is listed in `commands.list.rs` and granted in a capability.

use orasenda_core::{AppInfo, NotificationStatus};
use tauri::PackageInfo;

use crate::ipc::{
    SettingsError, StartRequest, StoreStatus, TimerCommandError, TimerCommandErrorKind,
    TimerSettings, TimerState, TimerView,
};

/// Name, version and platform of the running app.
#[tauri::command]
#[specta::specta]
pub fn app_info(app: tauri::AppHandle) -> AppInfo {
    app_info_from(app.package_info())
}

fn idle_view() -> TimerView {
    TimerView::idle(StoreStatus::Unavailable, NotificationStatus::Unavailable)
}

fn nothing_running() -> TimerCommandError {
    TimerCommandError {
        kind: TimerCommandErrorKind::NothingRunning,
        message: "no session is running".into(),
    }
}

/// The current timer view and any milestones not yet seen.
#[tauri::command]
#[specta::specta]
pub async fn timer_state(_app: tauri::AppHandle) -> TimerState {
    // T7 (#91) fills this in
    TimerState {
        view: idle_view(),
        pending: Vec::new(),
    }
}

/// Starts a session.
#[tauri::command]
#[specta::specta]
pub async fn timer_start(
    _app: tauri::AppHandle,
    _request: StartRequest,
) -> Result<TimerView, TimerCommandError> {
    // T7 (#91) fills this in
    Err(nothing_running())
}

/// Pauses the running session.
#[tauri::command]
#[specta::specta]
pub async fn timer_pause(_app: tauri::AppHandle) -> Result<TimerView, TimerCommandError> {
    // T7 (#91) fills this in
    Err(nothing_running())
}

/// Resumes a paused session.
#[tauri::command]
#[specta::specta]
pub async fn timer_resume(_app: tauri::AppHandle) -> Result<TimerView, TimerCommandError> {
    // T7 (#91) fills this in
    Err(nothing_running())
}

/// Stops the session.
#[tauri::command]
#[specta::specta]
pub async fn timer_stop(_app: tauri::AppHandle) -> Result<TimerView, TimerCommandError> {
    // T7 (#91) fills this in
    Err(nothing_running())
}

/// The saved timer settings.
#[tauri::command]
#[specta::specta]
pub fn settings_get(_app: tauri::AppHandle) -> TimerSettings {
    // T7 (#91) fills this in
    TimerSettings::default()
}

/// Saves the timer settings.
#[tauri::command]
#[specta::specta]
pub async fn settings_set(
    _app: tauri::AppHandle,
    _settings: TimerSettings,
) -> Result<(), SettingsError> {
    // T7 (#91) fills this in
    Ok(())
}

/// Name and version come from the app's package info, never from core's own Cargo metadata.
fn app_info_from(package: &PackageInfo) -> AppInfo {
    AppInfo::new(package.name.as_str(), package.version.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_uses_package_info_not_core_version() {
        let package = PackageInfo {
            name: "Orasenda".into(),
            version: "9.8.7".parse().unwrap(),
            authors: "",
            description: "",
            crate_name: "orasenda",
        };
        let info = app_info_from(&package);
        assert_eq!(info.name, "Orasenda");
        assert_eq!(info.version, "9.8.7");
        assert_eq!(info, AppInfo::new("Orasenda", "9.8.7"));
    }
}
