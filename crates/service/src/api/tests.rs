//! The API types' wire shapes.

use orasenda_core::{CustomSpec, Preset, TimerError};
use serde_json::json;

use super::*;

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
