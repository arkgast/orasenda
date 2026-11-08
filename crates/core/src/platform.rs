//! Traits the OS-specific crates implement so core logic never touches OS APIs.

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
