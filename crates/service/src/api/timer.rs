//! The timer's types: the view, the clock and the requests that start a session.

use orasenda_core::timer::suggestions::SuggestionLabel;
use orasenda_core::{BreakKind, EngineState, NotificationStatus, Phase, PresetId, SessionId};
use serde::{Deserialize, Serialize};

use super::events::MilestoneEvent;
use super::hint::Hint;
use super::tips::TipId;

/// The wall clock, emitted as `clock-tick` on every whole second.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ClockTick {
    /// UTC milliseconds since the Unix epoch. Exported as `number`: lossless below 2^53.
    #[specta(type = specta_typescript::Number)]
    pub epoch_ms: u64,
    /// The wall clock as text, formatted by Rust in the user's locale.
    pub clock: String,
    /// When the chosen preset would finish if started now, as text. Set only while idle.
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
    /// A break is running.
    Break,
    /// The last two minutes of a focus or a break, once the warning has fired.
    Warning,
    Paused,
    Idle,
}

/// One break suggestion: the line and how firmly the evidence backs it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SuggestionView {
    pub text: String,
    /// `optional` or `experimental`; `None` for a line with a source or a product principle.
    pub label: Option<SuggestionLabel>,
}

/// A question the timer is waiting on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum Offer {
    /// A `quick` session ended: keep going with the selected preset, or stop here.
    KeepGoing,
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
    /// The library preset the running session started with; `None` while idle and for `quick`.
    pub preset_id: Option<PresetId>,
    /// The snapshot's name, or "Just 2 minutes" for `quick`; `None` while idle.
    pub preset_name: Option<String>,
    /// The running session is the built-in two-minute start.
    pub quick: bool,
    /// The snapshot's break length in minutes; `None` while idle and for `quick`.
    pub break_min: Option<u32>,
    pub finish: Option<String>,
    /// The session's planned focus length in whole minutes, fixed at start (an edit to the preset
    /// mid-session does not move it); `None` while idle.
    pub planned_min: Option<u32>,
    pub store: StoreStatus,
    pub notifications: NotificationStatus,
    /// Which break it is, during a break.
    pub break_kind: Option<BreakKind>,
    /// "+10 min" taken so far in this session, in a break too (the focus's count).
    pub extensions: u8,
    /// "+10 min" is on offer now: under the cap, and not while paused or for `quick`.
    pub can_extend: bool,
    /// What the focus is for; `None` when not given and in a break.
    pub intent: Option<String>,
    /// The break's line, during a break only.
    pub suggestion: Option<SuggestionView>,
    /// "Keep going?", while idle after a `quick` session and auto-continue is off.
    pub offer: Option<Offer>,
    /// "Still going · ends 15:40", while running in an automatic step.
    pub check_in: Option<String>,
    /// The quiet line while idle once today's focus has passed the deep-hours cap.
    pub cap_line: Option<String>,
    /// A one-time hint for the status line; `None` once shown and while none is due.
    pub hint: Option<Hint>,
    /// A one-time tip for the status row, after a session end; `None` once seen and while none is due.
    pub tip: Option<TipId>,
    /// The first-run welcome line shows: no session was ever started on this device.
    pub welcome: bool,
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
            preset_id: None,
            preset_name: None,
            quick: false,
            break_min: None,
            finish: None,
            planned_min: None,
            store,
            notifications,
            break_kind: None,
            extensions: 0,
            can_extend: false,
            intent: None,
            suggestion: None,
            offer: None,
            check_in: None,
            cap_line: None,
            hint: None,
            tip: None,
            welcome: false,
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
    /// Start the built-in two-minute focus; otherwise the selected preset.
    pub quick: bool,
}
