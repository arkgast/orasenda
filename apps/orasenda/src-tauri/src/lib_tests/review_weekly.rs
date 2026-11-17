//! `weekly_get`, `weekly_save` and `weekly_complete`: in the manifest, granted to the main window only, and carried by the bindings.

use super::*;

#[test]
fn weekly_get_granted_to_main() {
    assert!(COMMANDS.contains(&"weekly_get"));
    let (_, main) = capability("main.json");
    assert!(main.iter().any(|p| p == "allow-weekly-get"));
    for file in ["overlay.json", "dev.json", "floater.json", "capture.json"] {
        let (_, other) = capability(file);
        assert!(!other.iter().any(|p| p == "allow-weekly-get"), "{file}");
    }
}

#[test]
fn bindings_carry_weekly_get() {
    let bindings = read_bindings();
    assert!(
        bindings.contains("weeklyGet: () => typedError<WeeklyView_Serialize, ReviewError>"),
        "bindings lack weeklyGet"
    );
}

#[test]
fn weekly_writes_granted_to_main() {
    for (command, permission) in [
        ("weekly_save", "allow-weekly-save"),
        ("weekly_complete", "allow-weekly-complete"),
    ] {
        assert!(COMMANDS.contains(&command));
        let (_, main) = capability("main.json");
        assert!(main.iter().any(|p| p == permission));
        for file in ["overlay.json", "dev.json", "floater.json", "capture.json"] {
            let (_, other) = capability(file);
            assert!(!other.iter().any(|p| p == permission), "{file}");
        }
    }
}

#[test]
fn bindings_carry_weekly_writes() {
    let bindings = read_bindings();
    for name in ["weeklySave", "weeklyComplete"] {
        assert!(
            bindings.contains(&format!(
                "{name}: (weekStart: string, draft: WeeklyDraft_Deserialize) => typedError<WeeklyView_Serialize, ReviewError>"
            )),
            "bindings lack {name}"
        );
    }
}
