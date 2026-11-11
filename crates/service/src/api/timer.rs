//! The timer's types: the view, the clock and the requests that start a session.

use orasenda_core::{CustomSpec, EngineState, NotificationStatus, Phase, Preset, SessionId};
use serde::{Deserialize, Serialize};

use super::events::MilestoneEvent;

/// The wall clock, emitted as `clock-tick` on every whole second.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClockTick {
    /// UTC milliseconds since the Unix epoch. Exported as `number`: lossless below 2^53.
    #[specta(type = specta_typescript::Number)]
    pub epoch_ms: u64,
    /// The wall clock as text, formatted by Rust in the user's locale.
    pub clock: String,
    /// When the running session would finish if left idle, as text, if one is running.
    pub idle_finish: Option<String>,
}

/// Whether the session store could be used.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum StoreStatus {
    Ok,
    Unavailable,
    Newer,
}

/// What the timer is doing, for the webview to name in words.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Focus,
    Paused,
    Idle,
}

/// Everything the webview shows about the timer, emitted as `timer-tick`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TimerView {
    pub state: EngineState,
    pub phase: Phase,
    pub mode: Mode,
    #[specta(type = specta_typescript::Number)]
    pub remaining_ms: u64,
    pub remaining: String,
    pub remaining_label: String,
    #[specta(type = specta_typescript::Number)]
    pub progress: f64,
    pub session_id: Option<SessionId>,
    pub preset: Option<Preset>,
    pub finish: Option<String>,
    pub store: StoreStatus,
    pub notifications: NotificationStatus,
}

impl TimerView {
    /// The view when nothing is running.
    pub fn idle(store: StoreStatus, notifications: NotificationStatus) -> TimerView {
        TimerView {
            state: EngineState::Idle,
            phase: Phase::Focus,
            mode: Mode::Idle,
            remaining_ms: 0,
            remaining: "00:00".into(),
            remaining_label: "0 seconds".into(),
            progress: 0.0,
            session_id: None,
            preset: None,
            finish: None,
            store,
            notifications,
        }
    }
}

/// The view plus milestones the webview has not seen yet.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub view: TimerView,
    pub pending: Vec<MilestoneEvent>,
}

/// Asks to start a session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartRequest {
    pub preset: Preset,
    pub custom: Option<CustomSpec>,
}
