//! Tauri commands. Each one is listed in `commands.list.rs` and granted in a capability.

use orasenda_core::{AppInfo, NotificationStatus};
use tauri::{Manager, PackageInfo};

use crate::ipc::{
    NavigatePage, NotificationsError, Settings, SettingsError, SettingsErrorKind, StartRequest,
    StoreStatus, TimerCommandError, TimerCommandErrorKind, TimerState, TimerView,
};
use crate::runtime::session::{self, Action};
use crate::{lifecycle, notifications};

/// Name, version and platform of the running app.
#[tauri::command]
#[specta::specta]
pub fn app_info(app: tauri::AppHandle) -> AppInfo {
    app_info_from(app.package_info())
}

/// Runs `work` on the blocking pool, so no lock, SQLite write or notifier read runs on the
/// async runtime or the main thread. `None` when the task panicked (logged).
pub(crate) async fn on_blocking<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
) -> Option<T> {
    match tauri::async_runtime::spawn_blocking(work).await {
        Ok(value) => Some(value),
        Err(error) => {
            eprintln!("commands: a session task failed: {error}");
            None
        }
    }
}

/// What a timer command returns when its task panicked: a failure, never a success.
fn task_failed() -> TimerCommandError {
    TimerCommandError {
        kind: TimerCommandErrorKind::Store,
        message: "Orasenda couldn't finish that. Try again.".into(),
    }
}

async fn run(app: tauri::AppHandle, action: Action) -> Result<TimerView, TimerCommandError> {
    on_blocking(move || session::run_action(&app, action))
        .await
        .unwrap_or_else(|| Err(task_failed()))
}

/// The current timer view and any milestones not yet seen.
#[tauri::command]
#[specta::specta]
pub async fn timer_state(app: tauri::AppHandle) -> TimerState {
    on_blocking(move || session::run_state(&app))
        .await
        .unwrap_or_else(|| TimerState {
            view: TimerView::idle(StoreStatus::Unavailable, NotificationStatus::Unavailable),
            pending: Vec::new(),
        })
}

/// Starts a session.
#[tauri::command]
#[specta::specta]
pub async fn timer_start(
    app: tauri::AppHandle,
    request: StartRequest,
) -> Result<TimerView, TimerCommandError> {
    run(app, Action::Start(request)).await
}

/// Pauses the running session.
#[tauri::command]
#[specta::specta]
pub async fn timer_pause(app: tauri::AppHandle) -> Result<TimerView, TimerCommandError> {
    run(app, Action::Pause).await
}

/// Resumes a paused session.
#[tauri::command]
#[specta::specta]
pub async fn timer_resume(app: tauri::AppHandle) -> Result<TimerView, TimerCommandError> {
    run(app, Action::Resume).await
}

/// Stops the session.
#[tauri::command]
#[specta::specta]
pub async fn timer_stop(app: tauri::AppHandle) -> Result<TimerView, TimerCommandError> {
    run(app, Action::Stop).await
}

// Sync: it only reads the cached settings under a brief lock.
/// The saved settings.
#[tauri::command]
#[specta::specta]
pub fn settings_get(app: tauri::AppHandle) -> Settings {
    session::current_settings(&app)
}

/// Saves the settings.
#[tauri::command]
#[specta::specta]
pub async fn settings_set(app: tauri::AppHandle, settings: Settings) -> Result<(), SettingsError> {
    on_blocking(move || session::run_set_settings(&app, settings))
        .await
        .unwrap_or_else(|| {
            Err(SettingsError {
                kind: SettingsErrorKind::Write,
                message: "Your settings couldn't be saved. Try again.".into(),
            })
        })
}

/// Name and version come from the app's package info, never from core's own Cargo metadata.
fn app_info_from(package: &PackageInfo) -> AppInfo {
    AppInfo::new(package.name.as_str(), package.version.to_string())
}

/// The notification permission status. Asks macOS once when it is `notDetermined` (callers that overlap share the prompt); otherwise returns the known status. Never errors.
#[tauri::command]
#[specta::specta]
pub async fn notifications_request(app: tauri::AppHandle) -> NotificationStatus {
    notifications::request(app).await
}

/// Opens the system notification settings for the app.
#[tauri::command]
#[specta::specta]
pub async fn notifications_open_settings(app: tauri::AppHandle) -> Result<(), NotificationsError> {
    notifications::open_settings(app).await
}

// Sync: it only swaps a small mutex.
/// The page the app was asked to show before the webview listened, once.
#[tauri::command]
#[specta::specta]
pub fn navigate_take(app: tauri::AppHandle) -> Option<NavigatePage> {
    app.try_state::<lifecycle::PendingNavigate>()
        .and_then(|pending| pending.take())
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
