//! The stats commands: only the main window may call them, and the generated contract carries
//! them.

use super::*;

const REVIEW_STATS: [&str; 2] = ["review_stats", "buffer_suggestion_dismiss"];

fn permission(command: &str) -> String {
    format!("allow-{}", command.replace('_', "-"))
}

#[test]
fn review_stats_granted_to_main() {
    for command in REVIEW_STATS {
        assert!(
            COMMANDS.contains(&command),
            "{command} is not in the manifest"
        );
    }
    let (_, main) = capability("main.json");
    for command in REVIEW_STATS {
        assert!(main.contains(&permission(command)), "main lacks {command}");
    }
    for file in ["floater.json", "capture.json", "dev.json", "overlay.json"] {
        let (_, other) = capability(file);
        for command in REVIEW_STATS {
            assert!(
                !other.contains(&permission(command)),
                "{file} has {command}"
            );
        }
    }
}

#[test]
fn bindings_carry_the_stats_commands() {
    let bindings = std::fs::read_to_string(bindings_path()).unwrap();
    for needle in [
        "reviewStats: (range: StatsRange) => typedError<StatsView_Serialize, ReviewError>",
        "bufferSuggestionDismiss: () => typedError<null, ReviewError>",
    ] {
        assert!(bindings.contains(needle), "bindings lack {needle}");
    }
}
