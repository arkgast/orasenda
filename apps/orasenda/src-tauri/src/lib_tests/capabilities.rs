//! The capability files: who may call which command (exact lists).

use std::path::Path;

use super::*;

/// The permission identifiers a capability file grants, and the windows it applies to.
pub(super) fn capability(file: &str) -> (Vec<String>, Vec<String>) {
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
        "allow-timer-dismiss-offer",
        "allow-timer-take-break",
        "allow-hint-shown",
        "allow-tip-seen",
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
        "allow-keyboard-recording",
        "allow-action-run",
        "allow-inbox-list",
        "allow-inbox-remove",
        "allow-inbox-restore",
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
pub(super) fn assert_capability(file: &str, windows: &[&str], permissions: &[&str]) {
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
            "allow-timer-dismiss-offer",
            "allow-timer-take-break",
            "allow-hint-shown",
            "allow-tip-seen",
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
            "allow-keyboard-recording",
            "allow-action-run",
            "allow-inbox-list",
            "allow-inbox-remove",
            "allow-inbox-restore",
            "allow-capture-open",
            "allow-data-overview",
            "allow-data-show-folder",
            "allow-data-delete-all",
            "allow-backups-create",
            "allow-backups-delete",
            "allow-backups-restore",
            "allow-backups-set-policy",
            "allow-data-export",
            "allow-data-import",
        ],
    );
    let (_, main) = capability("main.json");
    for withheld in [
        "allow-focus-view-close",
        "allow-main-show",
        "allow-timer-view",
        "allow-preset-select",
        "allow-capture-note",
        "allow-capture-close",
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
            "allow-capture-open",
        ],
    );
    let (_, focus) = capability("focus.json");
    for withheld in [
        "allow-timer-state",
        "allow-hint-shown",
        "allow-tip-seen",
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
            "allow-action-run",
            "allow-capture-open",
        ],
    );
    let (_, floater) = capability("floater.json");
    for withheld in [
        "allow-timer-extend",
        "allow-timer-take-break",
        "allow-timer-dismiss-offer",
        "allow-hint-shown",
        "allow-tip-seen",
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
        "capture.json",
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
