//! macOS implementations of the `orasenda-core` platform traits (ADR-010).
//!
//! Empty on every other target. `NSWorkspace.runningApplications` and `NSRunningApplication`
//! methods are thread-safe and run on any thread; observer registration needs the main thread.
#![cfg(target_os = "macos")]

mod control;
mod foreground;
mod idle;
mod overlay;

pub use control::{MacAppControl, phone_bundle_id};
pub use foreground::MacForeground;
pub use idle::MacIdle;
pub use overlay::{configure_overlay, cover_main_screen, focus_overlay};

use objc2::MainThreadMarker;
use orasenda_core::platform::PlatformError;

/// The main-thread marker, or `Other("not on main thread")` elsewhere.
pub(crate) fn main_thread() -> Result<MainThreadMarker, PlatformError> {
    MainThreadMarker::new().ok_or_else(|| PlatformError::Other("not on main thread".into()))
}
