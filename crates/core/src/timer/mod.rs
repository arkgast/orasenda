//! Timer domain types: session records and the engine's view. No clock, no I/O.

use serde::{Deserialize, Serialize};
use specta::Type;

pub mod engine;
pub mod format;
pub mod preset;
pub mod suggestions;

pub use engine::Session;
pub use format::{format_clock, format_remaining, spoken_remaining};
pub use preset::{
    DefaultPreset, PresetDef, PresetField, PresetId, PresetInvalid, SessionPreset, default_presets,
    normalize_name,
};

/// Length of a Quick start focus block, in milliseconds.
pub const QUICK_START_MS: u64 = 120_000;

/// Which part of the loop a session is in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Focus,
}

/// How a session ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum EndReason {
    Completed,
    Stopped,
}

/// Opaque session identifier, serialized as a bare string.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(transparent)]
pub struct SessionId(pub String);

/// A finished session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: SessionId,
    pub preset: SessionPreset,
    pub phase: Phase,
    pub planned_ms: u64,
    pub started_ms: u64,
    pub ended_ms: u64,
    pub paused_total_ms: u64,
    pub focused_ms: u64,
    pub end_reason: EndReason,
    pub extensions: u8,
}

/// Whether the timer is idle, counting or paused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum EngineState {
    Idle,
    Running,
    Paused,
}

/// A snapshot of the engine for the UI layer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EngineView {
    pub state: EngineState,
    pub phase: Phase,
    pub preset: Option<SessionPreset>,
    pub session_id: Option<SessionId>,
    pub remaining_ms: u64,
    pub progress: f64,
    pub planned_end_ms: Option<u64>,
    /// The session's planned focus length, fixed at start; `None` while idle.
    pub planned_ms: Option<u64>,
}

/// Something worth recording or announcing that the engine did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Milestone {
    Started,
    Paused,
    Resumed,
    Ended(SessionRecord),
}

/// Why a timer command was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TimerError {
    AlreadyRunning,
    NothingRunning,
    WrongState,
    InvalidSpec,
}

impl std::fmt::Display for TimerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            TimerError::AlreadyRunning => "a session is already running",
            TimerError::NothingRunning => "no session is running",
            TimerError::WrongState => "that can't be done while the session is in this state",
            TimerError::InvalidSpec => "focus can be 5 to 180 minutes, and a break 1 to 60",
        })
    }
}

impl std::error::Error for TimerError {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::NotificationStatus;

    #[test]
    fn notification_status_serializes_camel_case() {
        assert_eq!(
            serde_json::to_string(&NotificationStatus::NotDetermined).unwrap(),
            "\"notDetermined\""
        );
    }

    #[test]
    fn timer_error_serializes_camel_case() {
        assert_eq!(
            serde_json::to_string(&TimerError::WrongState).unwrap(),
            "\"wrongState\""
        );
    }

    #[test]
    fn session_id_serializes_as_plain_string() {
        assert_eq!(
            serde_json::to_string(&SessionId("abc".into())).unwrap(),
            "\"abc\""
        );
        let back: SessionId = serde_json::from_str("\"abc\"").unwrap();
        assert_eq!(back, SessionId("abc".into()));
    }
}
