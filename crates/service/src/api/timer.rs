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

/// The colour theme the person chose.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    /// Follow the system appearance.
    #[default]
    System,
    /// Always light.
    Light,
    /// Always dark.
    Dark,
}

/// The saved settings.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub theme: Theme,
    pub preset: Preset,
    pub custom: CustomSpec,
    pub notify_session_end: bool,
}

impl Default for Settings {
    fn default() -> Settings {
        Settings {
            theme: Theme::System,
            preset: Preset::Classic,
            custom: CustomSpec::default(),
            notify_session_end: false,
        }
    }
}

/// A page of the app shell.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum NavigatePage {
    Today,
    Board,
    Calendar,
    Routines,
    Review,
    Settings,
}

/// Asks the webview to show a page.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
#[serde(rename_all = "camelCase")]
#[tauri_specta(event_name = "navigate")]
pub struct Navigate {
    pub page: NavigatePage,
}

/// The settings changed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
#[tauri_specta(event_name = "settings-changed")]
pub struct SettingsChanged(pub Settings);

/// Why a notification settings call failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum NotificationsErrorKind {
    Unavailable,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NotificationsError {
    pub kind: NotificationsErrorKind,
    pub message: String,
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

    fn sample_settings() -> Settings {
        Settings {
            theme: Theme::Dark,
            ..Settings::default()
        }
    }

    #[test]
    fn settings_rejects_unknown_fields() {
        let good = json!({
            "theme": "system",
            "preset": "classic",
            "custom": { "focusMin": 45, "breakMin": 10 },
            "notifySessionEnd": true
        });
        assert!(serde_json::from_value::<Settings>(good.clone()).is_ok());
        let mut extra = good.clone();
        extra["extra"] = json!(1);
        assert!(serde_json::from_value::<Settings>(extra).is_err());
        let mut missing = good;
        missing.as_object_mut().unwrap().remove("theme");
        assert!(serde_json::from_value::<Settings>(missing).is_err());
    }

    #[test]
    fn settings_default_is_system_theme_and_notify_off() {
        let settings = Settings::default();
        assert_eq!(settings.theme, Theme::System);
        assert_eq!(settings.preset, Preset::Classic);
        assert_eq!(
            settings.custom,
            CustomSpec {
                focus_min: 45,
                break_min: 10
            }
        );
        assert!(!settings.notify_session_end);
    }

    #[test]
    fn navigate_event_serializes_lowercase_page() {
        assert_eq!(
            serde_json::to_value(Navigate {
                page: NavigatePage::Settings
            })
            .unwrap(),
            json!({ "page": "settings" })
        );
        assert_eq!(Navigate::NAME, "navigate");
        for (page, name) in [
            (NavigatePage::Today, "today"),
            (NavigatePage::Board, "board"),
            (NavigatePage::Calendar, "calendar"),
            (NavigatePage::Routines, "routines"),
            (NavigatePage::Review, "review"),
            (NavigatePage::Settings, "settings"),
        ] {
            assert_eq!(serde_json::to_value(page).unwrap(), json!(name));
            assert_eq!(
                serde_json::from_value::<NavigatePage>(json!(name)).unwrap(),
                page
            );
        }
    }

    #[test]
    fn settings_changed_serializes_as_settings() {
        let s = sample_settings();
        let value = serde_json::to_value(SettingsChanged(s.clone())).unwrap();
        assert_eq!(value, serde_json::to_value(&s).unwrap());
        assert_eq!(value["theme"], json!("dark"));
        assert!(value.get("notifySessionEnd").is_some());
        assert_eq!(SettingsChanged::NAME, "settings-changed");
    }
}
