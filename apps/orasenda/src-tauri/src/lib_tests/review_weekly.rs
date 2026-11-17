//! `weekly_get`: in the manifest, granted to the main window only, and carried by the bindings.

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
    let bindings = std::fs::read_to_string(bindings_path()).unwrap();
    assert!(
        bindings.contains("weeklyGet: () => typedError<WeeklyView_Serialize, ReviewError>"),
        "bindings lack weeklyGet"
    );
}
