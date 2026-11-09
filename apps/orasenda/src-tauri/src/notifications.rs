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
    crate::commands::on_blocking(move || known_or_read(&app))
        .await
        .unwrap_or(NotificationStatus::Unavailable)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::test_support::{Event, TestHost};

    #[test]
    fn stored_status_is_returned_without_reading_or_asking() {
        let host = TestHost::new(NotificationStatus::Granted);
        scheduler::store_status(&host, NotificationStatus::Denied);
        host.log().take();
        assert_eq!(known_or_read(&host), NotificationStatus::Denied);
        let events = host.log().take();
        assert!(!events.contains(&Event::StatusRead), "{events:?}");
        assert!(!events.contains(&Event::Requested), "{events:?}");
    }

    #[test]
    fn missing_status_is_read_stored_and_never_requested() {
        let host = TestHost::new(NotificationStatus::NotDetermined);
        assert_eq!(known_or_read(&host), NotificationStatus::NotDetermined);
        let events = host.log().take();
        assert_eq!(
            events.iter().filter(|e| **e == Event::StatusRead).count(),
            1,
            "{events:?}"
        );
        assert!(!events.contains(&Event::Requested), "{events:?}");
        assert_eq!(
            crate::session::lock(host.service().unwrap()).notifications(),
            Some(NotificationStatus::NotDetermined)
        );
    }
}
