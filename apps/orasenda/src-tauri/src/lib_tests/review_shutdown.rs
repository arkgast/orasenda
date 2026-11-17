//! The shutdown commands: only the main window may call them, and the generated contract
//! carries them.

use super::*;

const SHUTDOWN: [&str; 4] = [
    "shutdown_get",
    "shutdown_move",
    "shutdown_move_undo",
    "shutdown_complete",
];

fn permission(command: &str) -> String {
    format!("allow-{}", command.replace('_', "-"))
}

#[test]
fn shutdown_commands_granted_to_main() {
    for command in SHUTDOWN {
        assert!(
            COMMANDS.contains(&command),
            "{command} is not in the manifest"
        );
    }
    let (_, main) = capability("main.json");
    for command in SHUTDOWN {
        assert!(main.contains(&permission(command)), "main lacks {command}");
    }
    for file in ["floater.json", "capture.json", "dev.json", "overlay.json"] {
        let (_, other) = capability(file);
        for command in SHUTDOWN {
            assert!(
                !other.contains(&permission(command)),
                "{file} has {command}"
            );
        }
    }
}

#[test]
fn bindings_carry_the_shutdown_commands() {
    let bindings = read_bindings();
    for needle in [
        "shutdownGet: () => typedError<ShutdownView_Serialize, ReviewError>",
        "shutdownMove: (ids: string[]) => typedError<MoveUndo",
        "shutdownMoveUndo: (token: string) => typedError<string, ReviewError>",
        "shutdownComplete: (day: string, answers: ShutdownAnswers_Deserialize) => typedError<ShutdownView_Serialize, ReviewError>",
    ] {
        assert!(bindings.contains(needle), "bindings lack {needle}");
    }
}
