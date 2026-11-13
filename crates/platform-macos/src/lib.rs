//! macOS implementations of the `orasenda-core` platform traits (ADR-010).
//!
//! Empty on every other target. `NSWorkspace.runningApplications` and `NSRunningApplication`
//! methods are thread-safe and run on any thread; observer registration needs the main thread.
#![cfg(target_os = "macos")]

pub mod app_active;
mod bundle;
mod control;
mod foreground;
mod idle;
mod keep_awake;
mod local_time;
mod notifier;
mod overlay;
mod status_item;
mod voice_over;
pub mod windows;

pub use app_active::{is_active as app_active, observe_activation};
pub use bundle::is_app_bundle;
pub use control::{MacAppControl, phone_bundle_id};
pub use foreground::MacForeground;
pub use idle::MacIdle;
pub use keep_awake::{ActivityToken, MacKeepAwake};
pub use local_time::MacLocalTime;
pub use notifier::{MacNotifier, notification_settings_url};
pub use overlay::{configure_overlay, cover_main_screen, focus_overlay};
pub use status_item::set_status_item_accessibility_label;
pub use voice_over::{is_voice_over_enabled, observe_voice_over};

use objc2::MainThreadMarker;
use orasenda_core::platform::PlatformError;

/// The main-thread marker, or `Other("not on main thread")` elsewhere.
pub(crate) fn main_thread() -> Result<MainThreadMarker, PlatformError> {
    MainThreadMarker::new().ok_or_else(|| PlatformError::Other("not on main thread".into()))
}
