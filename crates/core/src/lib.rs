//! Orasenda product logic.
//!
//! Core never depends on Tauri or OS APIs, never uses `cfg(target_os)` and never reads the
//! clock: callers pass time in (ADR-001).

mod app_info;
pub mod blocking;
pub mod clock;
pub mod platform;
pub mod usage;

pub use app_info::{AppInfo, Os};
pub use blocking::{
    AppRef, BlockAction, BlockRule, Decision, Gate, GateAction, SAFETY_ALLOWLIST, decide,
};
pub use platform::{AppControl, ForegroundSource, IdleSource, PlatformError};
pub use usage::{IDLE_THRESHOLD_MS, UsageSegment, UsageTracker};
