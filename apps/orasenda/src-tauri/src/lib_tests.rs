use std::path::Path;

use tauri_specta::{BuilderConfiguration, Event, LanguageExt};

use super::*;

mod capabilities;
mod capture;
mod data;
mod data_files;

use capabilities::{assert_capability, capability};

/// A tauri-specta "language" that records the registered command names instead of
/// writing a file: the builder's configuration is only reachable through an exporter.
struct CommandNames<'a>(&'a mut Vec<String>);

impl LanguageExt for CommandNames<'_> {
    type Error = std::io::Error;

    fn export(self, cfg: &BuilderConfiguration, _path: &Path) -> Result<(), Self::Error> {
        self.0.extend(
            cfg.commands
                .iter()
                .map(|command| command.name().to_string()),
        );
        Ok(())
    }
}

#[test]
fn manifest_commands_match_specta_builder() {
    let mut registered = Vec::new();
    specta_builder()
        .export(CommandNames(&mut registered), "unused")
        .unwrap();
    registered.sort();
    let mut manifest: Vec<String> = COMMANDS.iter().map(|name| name.to_string()).collect();
    manifest.sort();
    assert_eq!(registered, manifest);
}

#[test]
fn clock_tick_serializes_as_epoch_ms_camel_case() {
    let tick = ClockTick {
        epoch_ms: 1_794_009_600_123,
        clock: "09:30".into(),
        idle_finish: None,
    };
    assert_eq!(
        serde_json::to_value(&tick).unwrap(),
        serde_json::json!({ "epochMs": 1_794_009_600_123_u64, "clock": "09:30", "idleFinish": null })
    );
    assert_eq!(ipc::ClockTickEvent::NAME, "clock-tick");
}

#[test]
fn tauri_conf_main_starts_hidden() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
    let json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    let main = json["app"]["windows"]
        .as_array()
        .unwrap()
        .iter()
        .find(|w| w["label"] == "main")
        .expect("main window entry");
    assert_eq!(main["visible"], serde_json::Value::Bool(false));
}

/// Regenerates `bindings.ts`; `just ci` fails when the committed file differs.
#[test]
fn export_bindings() {
    super::export_bindings(&specta_builder()).unwrap();
    let bindings = std::fs::read_to_string(bindings_path()).unwrap();
    assert!(
        bindings.contains("appInfo"),
        "no appInfo command:\n{bindings}"
    );
    assert!(
        bindings.contains("clockTick"),
        "no clockTick event:\n{bindings}"
    );
    for needle in [
        "timerTick",
        "timerMilestone",
        "idleFinish: string | null",
        "remainingMs: number",
        "plannedMin: number | null",
        "presetsList: () => __TAURI_INVOKE<PresetEntry[]>(\"presets_list\")",
        "nativeMenuPopup",
        "captureNote: (note: NewCapture) => typedError<NoteView, CaptureError>",
        "captureOpen: () => typedError<null, FocusViewError>",
        "captureClose: () => __TAURI_INVOKE<void>(\"capture_close\")",
        "captureFocus: makeEvent<",
        "inboxList: () => typedError<NoteView[], InboxError>",
        "inboxRemove: (id: string) => typedError<null, InboxError>",
        "inboxRestore: (id: string) => typedError<null, InboxError>",
        "inboxChanged: makeEvent<",
        "displaysList: () => __TAURI_INVOKE<DisplayInfo[]>(\"displays_list\")",
        "focusViewClose: () => typedError<null, FocusViewError>",
        "mainShow: () => typedError<null, FocusViewError>",
        "fullScreenEnter: () => typedError<null, FullScreenError>",
        "fullScreenEnterOn: (displayId: string) => typedError<null, FullScreenError>",
        "fullScreenLeave: () => typedError<null, FullScreenError>",
        "windowView: () => __TAURI_INVOKE<WindowView_Serialize>(\"window_view\")",
        "windowView: makeEvent<",
        "timerView: () => __TAURI_INVOKE<TimerView_Serialize>(\"timer_view\")",
        "keyboardState: () => __TAURI_INVOKE<KeyboardView_Serialize>(\"keyboard_state\")",
        "keyboardSetBinding: (id: ActionId, slot: Slot, keys: string | null, confirmWarning: boolean) => typedError<KeyboardView_Serialize, KeyboardError>",
        "keyboardRestoreDefault: (id: ActionId, slot: Slot) => typedError<KeyboardView_Serialize, KeyboardError>",
        "keyboardChanged: makeEvent<",
        "presetSelect: (presetId: string) => typedError<null, TimerCommandError>",
        "paletteOpen: makeEvent<",
        "progress: number",
        "timerStart: (request: StartRequest) => typedError<TimerView_Serialize, TimerCommandError>",
        "timerStop: () => typedError<TimerView_Serialize, TimerCommandError>",
        "timerPause: () => typedError<TimerView_Serialize, TimerCommandError>",
        "timerResume: () => typedError<TimerView_Serialize, TimerCommandError>",
        "timerExtend: () => typedError<TimerView_Serialize, TimerCommandError>",
        "timerDismissOffer: () => typedError<TimerView_Serialize, TimerCommandError>",
        "timerTakeBreak: () => typedError<TimerView_Serialize, TimerCommandError>",
        "typedError<null, SettingsError>",
        "settingsChanged: makeEvent<",
        "navigate: makeEvent<",
        "theme: Theme",
        "navigateTake",
        "notificationsOpenSettings",
        "notificationsRequest: () => __TAURI_INVOKE<NotificationStatus>(\"notifications_request\")",
    ] {
        assert!(
            bindings.contains(needle),
            "bindings lack {needle}:\n{bindings}"
        );
    }
    assert!(!bindings.contains("TimerSettings"));
    assert!(!bindings.contains("progress: number | null"));
    assert!(
        bindings.contains("epochMs: number"),
        "epochMs is not a number:\n{bindings}"
    );
}
