use std::path::Path;

use tauri_specta::{BuilderConfiguration, Event, LanguageExt};

use super::*;

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

/// The permission identifiers a capability file grants, and the windows it applies to.
fn capability(file: &str) -> (Vec<String>, Vec<String>) {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("capabilities")
        .join(file);
    let text = std::fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
    let json: serde_json::Value = serde_json::from_str(&text).unwrap();
    let strings = |key: &str| -> Vec<String> {
        json[key]
            .as_array()
            .unwrap_or_else(|| panic!("{file}: no {key} array"))
            .iter()
            .map(|value| value.as_str().unwrap().to_string())
            .collect()
    };
    (strings("windows"), strings("permissions"))
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

#[test]
fn overlay_capability_grants_only_overlay_choice() {
    let (windows, mut permissions) = capability("overlay.json");
    assert_eq!(windows, ["overlay"]);
    permissions.sort();
    assert_eq!(
        permissions,
        [
            "allow-spike-overlay-choice",
            "allow-spike-overlay-ready",
            "core:event:allow-listen",
            "core:event:allow-unlisten",
        ]
    );
}

#[test]
fn main_capability_grants_timer_and_settings_commands() {
    let (windows, permissions) = capability("main.json");
    assert_eq!(windows, ["main"]);
    for granted in [
        "allow-timer-state",
        "allow-timer-start",
        "allow-timer-pause",
        "allow-timer-resume",
        "allow-timer-stop",
        "allow-timer-extend",
        "allow-timer-set-intent",
        "allow-timer-dismiss-offer",
        "allow-timer-take-break",
        "allow-hint-shown",
        "allow-settings-get",
        "allow-settings-set",
        "allow-presets-list",
        "allow-preset-add",
        "allow-preset-update",
        "allow-preset-remove",
        "allow-preset-undo-remove",
        "allow-presets-restore-defaults",
        "allow-keyboard-state",
        "allow-keyboard-set-shortcut",
        "allow-keyboard-restore-default",
    ] {
        assert!(
            permissions.iter().any(|p| p == granted),
            "main lacks {granted}"
        );
    }
}

#[test]
fn dev_capability_includes_spike_commands_and_main_has_none() {
    let (windows, permissions) = capability("dev.json");
    assert_eq!(windows, ["dev"]);
    let (_, main) = capability("main.json");
    assert!(
        !main.iter().any(|p| p.starts_with("allow-spike")),
        "main still has a spike permission"
    );
    for granted in [
        "allow-spike-status",
        "allow-spike-running-apps",
        "allow-spike-rule",
        "allow-spike-set-rule",
        "allow-spike-usage",
    ] {
        assert!(
            permissions.iter().any(|p| p == granted),
            "dev lacks {granted}"
        );
    }
    for withheld in ["allow-spike-overlay-choice", "allow-spike-overlay-ready"] {
        assert!(
            !permissions.iter().any(|p| p == withheld),
            "dev has {withheld}"
        );
    }
}

#[test]
fn main_capability_grants_settings_page_commands() {
    let (windows, permissions) = capability("main.json");
    assert_eq!(windows, ["main"]);
    let (_, overlay) = capability("overlay.json");
    for granted in [
        "allow-notifications-request",
        "allow-notifications-open-settings",
        "allow-navigate-take",
    ] {
        assert!(
            permissions.iter().any(|p| p == granted),
            "main lacks {granted}"
        );
        assert!(
            !overlay.iter().any(|p| p == granted),
            "overlay has {granted}"
        );
    }
}

/// A capability's window patterns and permissions must equal these, in this order.
fn assert_capability(file: &str, windows: &[&str], permissions: &[&str]) {
    let (found_windows, found_permissions) = capability(file);
    assert_eq!(found_windows, windows, "{file}: windows");
    assert_eq!(found_permissions, permissions, "{file}: permissions");
}

#[test]
fn main_capability_exact() {
    assert_capability(
        "main.json",
        &["main"],
        &[
            "core:event:allow-listen",
            "core:event:allow-unlisten",
            "allow-app-info",
            "allow-timer-state",
            "allow-timer-start",
            "allow-timer-pause",
            "allow-timer-resume",
            "allow-timer-stop",
            "allow-timer-extend",
            "allow-timer-set-intent",
            "allow-timer-dismiss-offer",
            "allow-timer-take-break",
            "allow-hint-shown",
            "allow-settings-get",
            "allow-settings-set",
            "allow-notifications-request",
            "allow-notifications-open-settings",
            "allow-navigate-take",
            "allow-presets-list",
            "allow-native-menu-popup",
            "allow-displays-list",
            "allow-focus-view-open",
            "allow-preset-add",
            "allow-preset-update",
            "allow-preset-remove",
            "allow-preset-undo-remove",
            "allow-presets-restore-defaults",
            "allow-keyboard-state",
            "allow-keyboard-set-shortcut",
            "allow-keyboard-restore-default",
        ],
    );
    let (_, main) = capability("main.json");
    for withheld in [
        "allow-focus-view-close",
        "allow-main-show",
        "allow-timer-view",
        "allow-preset-select",
    ] {
        assert!(!main.iter().any(|p| p == withheld), "main has {withheld}");
    }
}

#[test]
fn focus_capability_exact_with_cadence() {
    assert_capability(
        "focus.json",
        &["focus-*"],
        &[
            "core:event:allow-listen",
            "core:event:allow-unlisten",
            "allow-timer-view",
            "allow-timer-start",
            "allow-timer-pause",
            "allow-timer-resume",
            "allow-timer-stop",
            "allow-timer-extend",
            "allow-timer-take-break",
            "allow-timer-dismiss-offer",
            "allow-settings-get",
            "allow-presets-list",
            "allow-preset-select",
            "allow-focus-view-close",
        ],
    );
    let (_, focus) = capability("focus.json");
    for withheld in [
        "allow-timer-state",
        "allow-hint-shown",
        "allow-settings-set",
        "allow-native-menu-popup",
        "allow-presets-get",
    ] {
        assert!(!focus.iter().any(|p| p == withheld), "focus has {withheld}");
    }
    assert!(
        !focus.iter().any(|p| p.starts_with("core:window:")),
        "focus has a window permission"
    );
}

#[test]
fn floater_capability_exact_with_cadence() {
    assert_capability(
        "floater.json",
        &["floater"],
        &[
            "core:event:allow-listen",
            "core:event:allow-unlisten",
            "core:window:allow-start-dragging",
            "allow-timer-view",
            "allow-timer-start",
            "allow-timer-pause",
            "allow-timer-resume",
            "allow-timer-stop",
            "allow-settings-get",
            "allow-native-menu-popup",
            "allow-focus-view-close",
            "allow-main-show",
        ],
    );
    let (_, floater) = capability("floater.json");
    for withheld in [
        "allow-timer-extend",
        "allow-timer-take-break",
        "allow-timer-dismiss-offer",
        "allow-hint-shown",
        "allow-settings-set",
        "allow-timer-state",
        "allow-preset-select",
    ] {
        assert!(
            !floater.iter().any(|p| p == withheld),
            "floater has {withheld}"
        );
    }
    // Only the floater may start a drag.
    for file in ["main.json", "focus.json", "dev.json", "overlay.json"] {
        let (_, other) = capability(file);
        assert!(
            !other
                .iter()
                .any(|p| p == "core:window:allow-start-dragging"),
            "{file} may drag"
        );
    }
}

#[test]
fn dev_and_overlay_capabilities_exact() {
    assert_capability(
        "dev.json",
        &["dev"],
        &[
            "core:event:allow-listen",
            "core:event:allow-unlisten",
            "allow-spike-status",
            "allow-spike-running-apps",
            "allow-spike-rule",
            "allow-spike-set-rule",
            "allow-spike-usage",
        ],
    );
    assert_capability(
        "overlay.json",
        &["overlay"],
        &[
            "core:event:allow-listen",
            "core:event:allow-unlisten",
            "allow-spike-overlay-ready",
            "allow-spike-overlay-choice",
        ],
    );
}

#[test]
fn every_manifest_command_is_granted_somewhere() {
    let granted: Vec<String> = [
        "main.json",
        "focus.json",
        "floater.json",
        "dev.json",
        "overlay.json",
    ]
    .iter()
    .flat_map(|file| capability(file).1)
    .collect();
    for command in COMMANDS {
        let permission = format!("allow-{}", command.replace('_', "-"));
        assert!(
            granted.contains(&permission),
            "no capability grants {permission}"
        );
    }
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
        "displaysList: () => __TAURI_INVOKE<DisplayInfo[]>(\"displays_list\")",
        "focusViewOpen: (target: FocusViewTarget) => typedError<null, FocusViewError>",
        "focusViewClose: () => typedError<null, FocusViewError>",
        "mainShow: () => typedError<null, FocusViewError>",
        "timerView: () => __TAURI_INVOKE<TimerView_Serialize>(\"timer_view\")",
        "keyboardState: () => __TAURI_INVOKE<KeyboardView_Serialize>(\"keyboard_state\")",
        "keyboardSetShortcut: (id: ShortcutId, keys: string | null) => typedError<KeyboardView_Serialize, KeyboardError>",
        "keyboardRestoreDefault: (id: ShortcutId) => typedError<KeyboardView_Serialize, KeyboardError>",
        "keyboardChanged: makeEvent<",
        "presetSelect: (presetId: string) => typedError<null, TimerCommandError>",
        "focusInsets: makeEvent<",
        "paletteOpen: makeEvent<",
        "progress: number",
        "timerStart: (request: StartRequest) => typedError<TimerView_Serialize, TimerCommandError>",
        "timerStop: () => typedError<TimerView_Serialize, TimerCommandError>",
        "timerPause: () => typedError<TimerView_Serialize, TimerCommandError>",
        "timerResume: () => typedError<TimerView_Serialize, TimerCommandError>",
        "timerExtend: () => typedError<TimerView_Serialize, TimerCommandError>",
        "timerSetIntent: (intent: string | null) => typedError<TimerView_Serialize, TimerCommandError>",
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
