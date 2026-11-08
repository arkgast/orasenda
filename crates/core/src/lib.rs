//! Orasenda product logic.
//!
//! Core never depends on Tauri or OS APIs, never uses `cfg(target_os)` and never reads the
//! clock: callers pass time in (ADR-001).

mod app_info;
pub mod clock;

pub use app_info::{AppInfo, Os};
