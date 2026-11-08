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
pub use overlay::{
    OverlayStrategy, configure_overlay, cover_main_screen, focus_overlay, restore_activation_policy,
};
