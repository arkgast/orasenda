//! Spike commands. Each one is listed in `commands.list.rs` and granted in a capability:
//! `main` gets status, running apps, rule and usage; `overlay` gets ready and choice.
//!
//! The `#[tauri::command]` functions are thin: the logic lives in plain functions over
//! [`Spike`], so it is tested with a fake [`SpikePlatform`].

use orasenda_core::{AppRef, BlockRule, PlatformError, UsageSegment};
use serde::{Deserialize, Serialize};
use tauri::State;

use super::{Spike, SpikePlatform};

mod overlay;
mod rules;
mod usage;

pub(crate) use overlay::{overlay_choice, overlay_ready};
pub(crate) use rules::{rule, running_apps, set_rule, status};
pub(crate) use usage::usage;

/// Whether the spike runs, and whether this OS has an implementation installed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SpikeStatus {
    pub enabled: bool,
    pub platform_supported: bool,
}

/// Why a spike command failed. Serialized as `{ kind, message }`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SpikeError {
    /// The spike flag is off (or this is a release build). Wins over `Unsupported`.
    Disabled,
    /// No spike implementation for this OS.
    Unsupported,
    /// The OS call failed.
    Platform(PlatformError),
}

/// What the user chose in the overlay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum OverlayChoice {
    /// *Back to focus*.
    Return,
    /// *Continue*, with the optional reason (logged, never stored).
    Continue { reason: Option<String> },
}

impl std::fmt::Display for SpikeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SpikeError::Disabled => f.write_str("the spike is disabled"),
            SpikeError::Unsupported => f.write_str("the spike is not supported on this platform"),
            SpikeError::Platform(error) => error.fmt(f),
        }
    }
}

impl std::error::Error for SpikeError {}

/// The wire shape of [`SpikeError`], which TypeScript sees as `SpikeError`.
mod wire {
    use serde::Serialize;

    /// Which spike error: `disabled` wins over `unsupported`.
    #[derive(Serialize, specta::Type)]
    #[serde(rename_all = "lowercase")]
    pub enum SpikeErrorKind {
        Disabled,
        Unsupported,
        Platform,
    }

    /// Why a spike command failed, with a message for the log.
    #[derive(Serialize, specta::Type)]
    #[serde(rename_all = "camelCase")]
    pub struct SpikeError {
        pub kind: SpikeErrorKind,
        pub message: String,
    }
}

impl Serialize for SpikeError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let kind = match self {
            SpikeError::Disabled => wire::SpikeErrorKind::Disabled,
            SpikeError::Unsupported => wire::SpikeErrorKind::Unsupported,
            SpikeError::Platform(_) => wire::SpikeErrorKind::Platform,
        };
        wire::SpikeError {
            kind,
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

impl specta::Type for SpikeError {
    fn definition(types: &mut specta::Types) -> specta::datatype::DataType {
        <wire::SpikeError as specta::Type>::definition(types)
    }
}

/// `Disabled` when the flag is off, else `Unsupported` without a platform.
fn platform(spike: &Spike) -> Result<&dyn SpikePlatform, SpikeError> {
    if !spike.enabled() {
        return Err(SpikeError::Disabled);
    }
    spike.platform().ok_or(SpikeError::Unsupported)
}

fn platform_error(error: PlatformError) -> SpikeError {
    SpikeError::Platform(error)
}

/// Whether the spike runs and the platform is supported. Never errors.
#[tauri::command]
#[specta::specta]
pub fn spike_status(spike: State<'_, Spike>) -> SpikeStatus {
    status(&spike)
}

/// Regular running apps, sorted by name, without Orasenda and the safety allowlist.
#[tauri::command]
#[specta::specta]
pub fn spike_running_apps(spike: State<'_, Spike>) -> Result<Vec<AppRef>, SpikeError> {
    running_apps(&spike)
}

/// The current block rule (it survives a webview reload).
#[tauri::command]
#[specta::specta]
pub fn spike_rule(spike: State<'_, Spike>) -> Result<BlockRule, SpikeError> {
    rule(&spike)
}

/// Replaces the block rule; it applies from the next foreground change.
#[tauri::command]
#[specta::specta]
pub fn spike_set_rule(spike: State<'_, Spike>, rule: BlockRule) -> Result<(), SpikeError> {
    set_rule(&spike, rule)
}

/// Usage segments, newest first, at most 20.
#[tauri::command]
#[specta::specta]
pub fn spike_usage(spike: State<'_, Spike>) -> Result<Vec<UsageSegment>, SpikeError> {
    usage(&spike)
}

/// The overlay page is listening; re-emits the pending `overlay-show`, if any.
#[tauri::command]
#[specta::specta]
pub fn spike_overlay_ready(spike: State<'_, Spike>) -> Result<(), SpikeError> {
    overlay_ready(&spike)
}

/// *Back to focus* or *Continue* from the overlay.
#[tauri::command]
#[specta::specta]
pub fn spike_overlay_choice(
    spike: State<'_, Spike>,
    choice: OverlayChoice,
) -> Result<(), SpikeError> {
    overlay_choice(&spike, choice)
}

#[cfg(test)]
mod tests;
