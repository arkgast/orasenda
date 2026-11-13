//! The per-OS choice of the session's platform services (ADR-010): the only place in the app
//! crate that picks a `KeepAwake`, `LocalTime` and `Notifier` implementation.

#[cfg(target_os = "macos")]
use std::sync::Arc;

#[cfg(target_os = "macos")]
use orasenda_core::Notifier;

use crate::runtime::session::Platform;

/// The production platform: on macOS the AppKit and Foundation services from
/// `orasenda-platform-macos` (the notifier only inside an `.app` bundle); elsewhere the core
/// no-ops.
pub fn current() -> Platform {
    #[cfg(target_os = "macos")]
    {
        use orasenda_platform_macos::{MacKeepAwake, MacLocalTime, is_app_bundle};
        Platform {
            keep_awake: Box::new(MacKeepAwake),
            local_time: Box::new(MacLocalTime),
            notifier: choose_notifier(is_app_bundle()),
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        use std::sync::Arc;

        use orasenda_core::{NoopKeepAwake, NoopNotifier, UtcLocalTime};
        Platform {
            keep_awake: Box::new(NoopKeepAwake),
            local_time: Box::new(UtcLocalTime),
            notifier: Arc::new(NoopNotifier),
        }
    }
}

/// `MacNotifier` only inside an `.app` bundle: outside one (`tauri dev`, `cargo test`)
/// `UNUserNotificationCenter` aborts the process, so the status stays `unavailable`.
#[cfg(target_os = "macos")]
pub(crate) fn choose_notifier(in_bundle: bool) -> Arc<dyn Notifier> {
    if in_bundle {
        Arc::new(orasenda_platform_macos::MacNotifier)
    } else {
        Arc::new(orasenda_core::NoopNotifier)
    }
}

/// Shows `path` in the file manager. A no-op off macOS, where there is no implementation yet.
pub fn reveal(path: &std::path::Path) -> Result<(), orasenda_core::PlatformError> {
    #[cfg(target_os = "macos")]
    {
        orasenda_platform_macos::reveal_in_finder(path)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "macos")]
    #[test]
    fn choose_notifier_outside_bundle_is_noop() {
        use std::sync::mpsc::channel;

        use orasenda_core::NotificationStatus;

        // A `MacNotifier` here would abort the test process: `cargo test` is not a bundle.
        let notifier = super::choose_notifier(false);
        assert_eq!(notifier.status(), NotificationStatus::Unavailable);
        let (sent, answer) = channel();
        notifier.request(Box::new(move |status| sent.send(status).unwrap()));
        assert_eq!(answer.recv().unwrap(), NotificationStatus::Unavailable);
        assert_eq!(
            notifier.post("title", "body"),
            Err(orasenda_core::PlatformError::Unsupported)
        );
    }
}
