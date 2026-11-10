//! Traits the OS-specific crates implement so core logic never touches OS APIs.

use std::any::Any;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::blocking::AppRef;

/// Why a platform call failed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlatformError {
    /// This platform has no implementation.
    Unsupported,
    /// The app or window no longer exists.
    NotFound,
    /// The OS refused the request.
    Refused,
    /// Anything else, with a message.
    Other(String),
}

/// Reports which app is in front.
pub trait ForegroundSource {
    /// The app currently in front, if any.
    fn frontmost(&self) -> Option<AppRef>;
    /// Calls `sink` for every change of the frontmost app.
    fn subscribe(&self, sink: Box<dyn Fn(AppRef) + Send + Sync>) -> Result<(), PlatformError>;
}

/// Lists and controls running apps.
pub trait AppControl {
    /// Regular (user-facing) running apps.
    fn running_apps(&self) -> Vec<AppRef>;
    /// Hides the app with this pid.
    fn hide(&self, pid: i32) -> Result<(), PlatformError>;
    /// Asks the app to quit normally.
    fn terminate(&self, pid: i32) -> Result<(), PlatformError>;
    /// Brings the app to the front.
    fn activate(&self, pid: i32) -> Result<(), PlatformError>;
}

/// Reports time since the last user input.
pub trait IdleSource {
    /// Milliseconds since the last input event.
    fn idle_ms(&self) -> Result<u64, PlatformError>;
}

impl std::fmt::Display for PlatformError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PlatformError::Unsupported => f.write_str("not supported on this platform"),
            PlatformError::NotFound => f.write_str("app not found"),
            PlatformError::Refused => f.write_str("the OS refused the request"),
            PlatformError::Other(msg) => f.write_str(msg),
        }
    }
}

impl std::error::Error for PlatformError {}

/// Clock-style preference for showing times.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HourCycle {
    H12,
    H23,
}

/// Whether the app may post notifications, serialized camelCase.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum NotificationStatus {
    NotDetermined,
    Denied,
    Granted,
    Unavailable,
}

/// Keeps the machine awake while the returned guard is alive.
pub trait KeepAwake: Send + Sync {
    /// Starts holding the machine awake. Dropping the guard releases it.
    fn begin(&self, reason: &str) -> Result<Box<dyn Any + Send>, PlatformError>;
}

/// Keeps nothing awake.
#[derive(Debug, Clone, Copy, Default)]
pub struct NoopKeepAwake;

impl KeepAwake for NoopKeepAwake {
    fn begin(&self, _reason: &str) -> Result<Box<dyn Any + Send>, PlatformError> {
        Ok(Box::new(()))
    }
}

/// The user's local time zone and clock preference.
pub trait LocalTime: Send + Sync {
    /// Minutes east of UTC at that instant.
    fn utc_offset_min(&self, at_epoch_ms: u64) -> i32;
    fn hour_cycle(&self) -> HourCycle;
}

/// UTC with a 24-hour clock.
#[derive(Debug, Clone, Copy, Default)]
pub struct UtcLocalTime;

impl LocalTime for UtcLocalTime {
    fn utc_offset_min(&self, _at_epoch_ms: u64) -> i32 {
        0
    }
    fn hour_cycle(&self) -> HourCycle {
        HourCycle::H23
    }
}

/// Asks for permission and posts notifications.
pub trait Notifier: Send + Sync {
    fn status(&self) -> NotificationStatus;
    /// Asks the user; calls `done` with the outcome.
    fn request(&self, done: Box<dyn FnOnce(NotificationStatus) + Send>);
    fn post(&self, title: &str, body: &str) -> Result<(), PlatformError>;
    /// Opens the OS notification settings for this app. `Unsupported` when there is
    /// nothing to open; any other error means the OS refused or failed.
    fn open_settings(&self) -> Result<(), PlatformError>;
}

/// A notifier for platforms without notifications.
#[derive(Debug, Clone, Copy, Default)]
pub struct NoopNotifier;

impl Notifier for NoopNotifier {
    fn status(&self) -> NotificationStatus {
        NotificationStatus::Unavailable
    }
    fn request(&self, done: Box<dyn FnOnce(NotificationStatus) + Send>) {
        done(NotificationStatus::Unavailable);
    }
    fn post(&self, _title: &str, _body: &str) -> Result<(), PlatformError> {
        Err(PlatformError::Unsupported)
    }
    fn open_settings(&self) -> Result<(), PlatformError> {
        Err(PlatformError::Unsupported)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_error_display_text() {
        assert_eq!(
            PlatformError::Unsupported.to_string(),
            "not supported on this platform"
        );
        assert_eq!(PlatformError::NotFound.to_string(), "app not found");
        assert_eq!(
            PlatformError::Refused.to_string(),
            "the OS refused the request"
        );
        assert_eq!(PlatformError::Other("boom".into()).to_string(), "boom");
        let _: &dyn std::error::Error = &PlatformError::Refused;
    }

    #[test]
    fn noop_keep_awake_returns_a_guard() {
        assert!(NoopKeepAwake.begin("focus").is_ok());
    }

    #[test]
    fn utc_local_time_is_zero_h23() {
        assert_eq!(UtcLocalTime.utc_offset_min(1_794_009_600_000), 0);
        assert_eq!(UtcLocalTime.hour_cycle(), HourCycle::H23);
    }

    #[test]
    fn noop_notifier_is_unavailable_and_post_is_unsupported() {
        use std::sync::mpsc;
        assert_eq!(NoopNotifier.status(), NotificationStatus::Unavailable);
        let (tx, rx) = mpsc::channel();
        NoopNotifier.request(Box::new(move |s| tx.send(s).unwrap()));
        assert_eq!(rx.try_recv(), Ok(NotificationStatus::Unavailable));
        assert_eq!(NoopNotifier.post("t", "b"), Err(PlatformError::Unsupported));
    }

    #[test]
    fn noop_notifier_open_settings_is_unsupported() {
        assert_eq!(
            NoopNotifier.open_settings(),
            Err(PlatformError::Unsupported)
        );
    }
}
