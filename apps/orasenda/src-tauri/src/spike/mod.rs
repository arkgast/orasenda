//! The macOS detection-and-overlay spike (docs/specs/2026-11-07-macos-blocking-spike.md).
//!
//! Dev-only: it runs only when [`enabled`] (a debug build with `ORASENDA_SPIKE=1`). The
//! commands exist in every build and on every OS so `bindings.ts` is identical everywhere;
//! without an installed [`SpikePlatform`] they return `Unsupported`, and with the flag off
//! they return `Disabled`.

pub(crate) mod commands;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
mod overlay;
pub(crate) mod state;

use orasenda_core::{AppRef, BlockAction, PlatformError};
use serde::{Deserialize, Serialize};

pub(crate) use state::Spike;

/// Whether the spike runs: a debug build and `ORASENDA_SPIKE=1`.
pub(crate) fn enabled() -> bool {
    enabled_from(
        cfg!(debug_assertions),
        std::env::var("ORASENDA_SPIKE").ok().as_deref(),
    )
}

/// [`enabled`] with its inputs passed in, so it is testable without touching the environment.
pub(crate) fn enabled_from(debug_build: bool, flag: Option<&str>) -> bool {
    debug_build && flag == Some("1")
}

/// Starts the spike. Does nothing when it is disabled or not on macOS; the macOS branch
/// (overlay window, foreground observer, idle thread) installs a [`SpikePlatform`].
pub(crate) fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::Manager;

    if !app.state::<Spike>().enabled() {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    macos::setup(app)?;
    Ok(())
}

/// The side effects the spike needs from the OS and the windows. The macOS implementation
/// reaches AppKit through `run_on_main_thread`; on other OS, or when the spike is disabled,
/// none is installed. Callers never hold the [`state::SpikeState`] lock while calling these.
pub(crate) trait SpikePlatform: Send + Sync {
    /// Regular (user-facing) running apps, unfiltered and unsorted.
    fn running_apps(&self) -> Vec<AppRef>;
    /// Hides or asks to quit the app with this pid.
    fn hide_or_close(&self, pid: i32, action: BlockAction) -> Result<(), PlatformError>;
    /// Brings the app with this pid to the front.
    fn activate(&self, pid: i32) -> Result<(), PlatformError>;
    /// Emits `overlay-show` to window `overlay` and shows it in front.
    fn show_overlay(&self, show: OverlayShow) -> Result<(), PlatformError>;
    /// Hides window `overlay`.
    fn hide_overlay(&self) -> Result<(), PlatformError>;
    /// Shows and focuses Orasenda's main window.
    fn show_main(&self) -> Result<(), PlatformError>;
}

/// Sent to window `overlay` when it should prompt for an app. The pid stays in Rust.
#[derive(
    Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type, tauri_specta::Event,
)]
#[serde(rename_all = "camelCase")]
pub struct OverlayShow {
    pub app_name: String,
}

/// Sent to window `main` when usage changed; the dev panel then calls `spike_usage`.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct SpikeUsageChanged;
