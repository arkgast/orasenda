//! Notification permission and settings for the Settings page (spec B). Interim bodies
//! until T4 (#145).

use orasenda_core::NotificationStatus;
use tauri::AppHandle;

use crate::ipc::{NotificationsError, NotificationsErrorKind};
use crate::scheduler::{self, Host};
use crate::session;

/// Managed state for the permission flow. T4 (#145) adds the waiter list and the
/// single-flight flag.
#[derive(Default)]
pub(crate) struct Notifications;

/// The known status; when none is stored, reads it (never under the session lock) and
/// stores it. Never asks.
fn known_or_read<H: Host>(host: &H) -> NotificationStatus {
    let known = host
        .service()
        .and_then(|service| session::lock(service).notifications());
    match known {
        Some(status) => status,
        None => {
            let status = host.notifier().status();
            scheduler::store_status(host, status);
            status
        }
    }
}

// Interim: T4 (#145) replaces this.
pub(crate) async fn request(app: AppHandle) -> NotificationStatus {
    match tauri::async_runtime::spawn_blocking(move || known_or_read(&app)).await {
        Ok(status) => status,
        Err(error) => {
            eprintln!("notifications: the status read failed: {error}");
            NotificationStatus::Unavailable
        }
    }
}

// Interim: T4 (#145) replaces this.
pub(crate) async fn open_settings(_app: AppHandle) -> Result<(), NotificationsError> {
    Err(NotificationsError {
        kind: NotificationsErrorKind::Unavailable,
        message: "notification settings can't be opened yet".into(),
    })
}

// Interim: T4 (#145) replaces this.
pub(crate) fn on_main_focused(_app: &AppHandle) {}
