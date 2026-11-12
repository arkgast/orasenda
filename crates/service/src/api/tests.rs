//! The API types' wire shapes.

use orasenda_core::TimerError;
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
    let ok: StartRequest = serde_json::from_value(json!({ "quick": true })).unwrap();
    assert!(ok.quick);
    assert!(serde_json::from_value::<StartRequest>(json!({ "quick": false, "extra": 1 })).is_err());
    assert!(serde_json::from_value::<StartRequest>(json!({ "preset": "classic" })).is_err());
}

fn settings_json() -> serde_json::Value {
    json!({
        "theme": "system",
        "presetId": "0192f6a0-0000-7000-8000-000000000002",
        "extensionCap": 2,
        "autoContinue": false,
        "longestFocusMin": 90,
        "deepCapOn": true,
        "deepCapHours": 4,
        "notifySessionEnd": true,
        "notifyTwoMinutes": false
    })
}

#[test]
fn settings_rejects_unknown_fields() {
    let good = settings_json();
    assert!(serde_json::from_value::<Settings>(good.clone()).is_ok());
    let mut extra = good.clone();
    extra["extra"] = json!(1);
    assert!(serde_json::from_value::<Settings>(extra).is_err());
    let mut old = good.clone();
    old["custom"] = json!({ "focusMin": 45, "breakMin": 10 });
    assert!(serde_json::from_value::<Settings>(old).is_err());
    let mut missing = good;
    missing.as_object_mut().unwrap().remove("theme");
    assert!(serde_json::from_value::<Settings>(missing).is_err());
}

#[test]
fn settings_default_is_steady_focus_with_the_spec_defaults() {
    let settings = Settings::default();
    assert_eq!(settings.theme, Theme::System);
    assert_eq!(settings.preset_id, orasenda_core::default_presets()[1].id);
    assert_eq!(settings.extension_cap, 2);
    assert!(!settings.auto_continue);
    assert_eq!(settings.longest_focus_min, 90);
    assert!(settings.deep_cap_on);
    assert_eq!(settings.deep_cap_hours, 4);
    assert!(!settings.notify_session_end);
    assert!(!settings.notify_two_minutes);
    let mut value = settings_json();
    value["notifySessionEnd"] = json!(false);
    assert_eq!(serde_json::to_value(&settings).unwrap(), value);
}

#[test]
fn preset_entries_flag_defaults_and_changes() {
    let mut presets = orasenda_core::default_presets().to_vec();
    presets[0].focus_min = 20;
    presets.push(orasenda_core::PresetDef {
        id: orasenda_core::PresetId("user".into()),
        name: "Mine".into(),
        focus_min: 30,
        break_min: 5,
        long_break_min: 15,
        rounds: 4,
        default_key: None,
    });
    let listed = entries(&presets);
    let flags: Vec<_> = listed
        .iter()
        .map(|e| (e.is_default, e.is_changed))
        .collect();
    assert_eq!(
        flags,
        [(true, true), (true, false), (true, false), (false, false)]
    );
    assert_eq!(
        serde_json::to_value(&listed[1]).unwrap(),
        json!({
            "id": "0192f6a0-0000-7000-8000-000000000002",
            "name": "Steady Focus",
            "focusMin": 25,
            "breakMin": 5,
            "longBreakMin": 15,
            "rounds": 4,
            "isDefault": true,
            "isChanged": false
        })
    );
}

#[test]
fn milestone_kinds_go_over_ipc_in_camel_case() {
    use crate::api::MilestoneKind;
    let name = |k| serde_json::to_value(k).unwrap();
    assert_eq!(name(MilestoneKind::BreakStarted), "breakStarted");
    assert_eq!(name(MilestoneKind::CapReached), "capReached");
    assert_eq!(name(MilestoneKind::Warned), "warned");
}
