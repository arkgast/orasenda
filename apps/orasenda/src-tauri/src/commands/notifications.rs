//! The notification commands.

use orasenda_core::NotificationStatus;

use crate::ipc::NotificationsError;
use crate::notifications;

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
