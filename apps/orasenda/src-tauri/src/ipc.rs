//! The IPC contract for the focus session loop: every type and event the webview sees.
//! Typed by tauri-specta (ADR-007); `src/bindings.ts` is generated from these.

use orasenda_core::{
    CustomSpec, EndReason, EngineState, NotificationStatus, Phase, Preset, SessionId, TimerError,
};
use serde::{Deserialize, Serialize};

/// The wall clock, emitted as `clock-tick` on every whole second.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
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
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "timer-tick")]
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

/// What happened to a session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum MilestoneKind {
    Started,
    Paused,
    Resumed,
    Ended,
    Recovered,
}

/// A session milestone, emitted as `timer-milestone`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "timer-milestone")]
pub struct MilestoneEvent {
    pub kind: MilestoneKind,
    pub end_reason: Option<EndReason>,
    pub session_id: Option<SessionId>,
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

/// The saved timer settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimerSettings {
    pub preset: Preset,
    pub custom: CustomSpec,
    pub notify_session_end: bool,
}

impl Default for TimerSettings {
    fn default() -> TimerSettings {
        TimerSettings {
            preset: Preset::Classic,
            custom: CustomSpec::default(),
            notify_session_end: true,
        }
    }
}

/// Why a timer command failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TimerCommandErrorKind {
    AlreadyRunning,
    NothingRunning,
    WrongState,
    InvalidSpec,
    Store,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TimerCommandError {
    pub kind: TimerCommandErrorKind,
    pub message: String,
}

impl From<TimerError> for TimerCommandError {
    fn from(error: TimerError) -> TimerCommandError {
        let kind = match error {
            TimerError::AlreadyRunning => TimerCommandErrorKind::AlreadyRunning,
            TimerError::NothingRunning => TimerCommandErrorKind::NothingRunning,
            TimerError::WrongState => TimerCommandErrorKind::WrongState,
            TimerError::InvalidSpec => TimerCommandErrorKind::InvalidSpec,
        };
        TimerCommandError {
            kind,
            message: error.to_string(),
        }
    }
}

/// Why saving settings failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SettingsErrorKind {
    InvalidSpec,
    Unavailable,
    Write,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SettingsError {
    pub kind: SettingsErrorKind,
    pub message: String,
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use tauri_specta::Event;

    use super::*;

    #[test]
    fn timer_view_serializes_camel_case_with_number_fields() {
        let view = TimerView::idle(StoreStatus::Ok, NotificationStatus::Unavailable);
        assert_eq!(
            serde_json::to_value(&view).unwrap(),
            json!({
                "state": "idle",
                "phase": "focus",
                "mode": "idle",
                "remainingMs": 0,
                "remaining": "00:00",
                "remainingLabel": "0 seconds",
                "progress": 0.0,
                "sessionId": null,
                "preset": null,
                "finish": null,
                "store": "ok",
                "notifications": "unavailable",
            })
        );
        assert_eq!(TimerView::NAME, "timer-tick");
    }

    #[test]
    fn timer_command_error_serializes_kind_message() {
        let error = TimerCommandError {
            kind: TimerCommandErrorKind::AlreadyRunning,
            message: "x".into(),
        };
        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            json!({ "kind": "alreadyRunning", "message": "x" })
        );
    }

    #[test]
    fn timer_command_error_from_timer_error_maps_kinds() {
        for (from, kind) in [
            (
                TimerError::AlreadyRunning,
                TimerCommandErrorKind::AlreadyRunning,
            ),
            (
                TimerError::NothingRunning,
                TimerCommandErrorKind::NothingRunning,
            ),
            (TimerError::WrongState, TimerCommandErrorKind::WrongState),
            (TimerError::InvalidSpec, TimerCommandErrorKind::InvalidSpec),
        ] {
            let mapped = TimerCommandError::from(from);
            assert_eq!(mapped.kind, kind);
            assert_eq!(mapped.message, from.to_string());
            assert!(!mapped.message.contains('!'));
        }
    }

    #[test]
    fn milestone_event_nulls_absent_fields() {
        let event = MilestoneEvent {
            kind: MilestoneKind::Started,
            end_reason: None,
            session_id: None,
        };
        assert_eq!(
            serde_json::to_value(&event).unwrap(),
            json!({ "kind": "started", "endReason": null, "sessionId": null })
        );
        assert_eq!(MilestoneEvent::NAME, "timer-milestone");
    }

    #[test]
    fn start_request_rejects_unknown_fields() {
        let ok: StartRequest =
            serde_json::from_value(json!({ "preset": "classic", "custom": null })).unwrap();
        assert_eq!(ok.preset, Preset::Classic);
        let bad = serde_json::from_value::<StartRequest>(
            json!({ "preset": "classic", "custom": null, "extra": 1 }),
        );
        assert!(bad.is_err());
    }

    #[test]
    fn timer_settings_rejects_unknown_fields() {
        let bad = serde_json::from_value::<TimerSettings>(json!({
            "preset": "classic",
            "custom": { "focusMin": 45, "breakMin": 10 },
            "notifySessionEnd": true,
            "extra": 1
        }));
        assert!(bad.is_err());
    }

    #[test]
    fn timer_settings_default_is_classic_45_10_notify() {
        let settings = TimerSettings::default();
        assert_eq!(settings.preset, Preset::Classic);
        assert_eq!(
            settings.custom,
            CustomSpec {
                focus_min: 45,
                break_min: 10
            }
        );
        assert!(settings.notify_session_end);
    }
}
