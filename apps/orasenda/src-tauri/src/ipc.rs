//! The IPC contract for the focus session loop: every type and event the webview sees.
//! The types live in `orasenda-service` (`api`); this module re-exports them and adds what
//! needs Tauri: the events. Typed by tauri-specta (ADR-007); `src/ipc/bindings.ts` is generated
//! from these.
//!
//! `tauri_specta::Event` can't be derived in the service crate (it depends on Tauri), and
//! the orphan rule stops the app implementing it for a service type. So `clock-tick`,
//! `timer-tick` and `timer-milestone` are carried by transparent newtypes: same JSON, same
//! TypeScript type, same event name: each wrapper's `specta::Type` is its inner type's, so
//! `bindings.ts` names the inner type.

use serde::{Deserialize, Serialize};
use specta::datatype::DataType;
use specta::{Type, Types};

pub use orasenda_service::api::*;

/// `clock-tick`: the wall clock on every whole second.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, tauri_specta::Event)]
#[serde(transparent)]
#[tauri_specta(event_name = "clock-tick")]
pub struct ClockTickEvent(pub ClockTick);

impl Type for ClockTickEvent {
    fn definition(types: &mut Types) -> DataType {
        <ClockTick as Type>::definition(types)
    }
}

/// `timer-tick`: everything the webview shows about the timer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, tauri_specta::Event)]
#[serde(transparent)]
#[tauri_specta(event_name = "timer-tick")]
pub struct TimerTickEvent(pub TimerView);

impl Type for TimerTickEvent {
    fn definition(types: &mut Types) -> DataType {
        <TimerView as Type>::definition(types)
    }
}

/// `timer-milestone`: a session milestone.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, tauri_specta::Event)]
#[serde(transparent)]
#[tauri_specta(event_name = "timer-milestone")]
pub struct TimerMilestoneEvent(pub MilestoneEvent);

impl Type for TimerMilestoneEvent {
    fn definition(types: &mut Types) -> DataType {
        <MilestoneEvent as Type>::definition(types)
    }
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

#[cfg(test)]
mod tests {
    use orasenda_core::NotificationStatus;
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
                "plannedMin": null,
                "store": "ok",
                "notifications": "unavailable",
            })
        );
        assert_eq!(TimerTickEvent::NAME, "timer-tick");
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
        assert_eq!(TimerMilestoneEvent::NAME, "timer-milestone");
    }

    fn sample_settings() -> Settings {
        Settings {
            theme: Theme::Dark,
            ..Settings::default()
        }
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
