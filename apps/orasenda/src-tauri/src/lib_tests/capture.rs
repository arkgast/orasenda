//! The capture panel's capability: exactly what it may do, and who may open it.

use super::*;

#[test]
fn capture_capability_exact() {
    assert_capability(
        "capture.json",
        &["capture"],
        &[
            "core:event:allow-listen",
            "core:event:allow-unlisten",
            "allow-capture-note",
            "allow-capture-close",
            "allow-settings-get",
        ],
    );
    // The panel only writes: it cannot read or remove notes, change settings, or open itself.
    let (_, capture) = capability("capture.json");
    for withheld in [
        "allow-inbox-list",
        "allow-inbox-remove",
        "allow-inbox-restore",
        "allow-settings-set",
        "allow-capture-open",
        "allow-timer-state",
        "allow-timer-view",
        "allow-keyboard-state",
        "allow-keyboard-set-shortcut",
    ] {
        assert!(
            !capture.iter().any(|p| p == withheld),
            "capture has {withheld}"
        );
    }
    assert!(
        !capture
            .iter()
            .any(|p| p.starts_with("core:window:") || p.contains("global-shortcut")),
        "capture has a window or plugin permission"
    );
    // Every window that can open the panel has `capture_open`; only `capture` has the rest.
    for file in ["main.json", "focus.json", "floater.json"] {
        let (_, other) = capability(file);
        assert!(
            other.iter().any(|p| p == "allow-capture-open"),
            "{file} lacks capture_open"
        );
        for own in ["allow-capture-note", "allow-capture-close"] {
            assert!(!other.iter().any(|p| p == own), "{file} has {own}");
        }
    }
}
