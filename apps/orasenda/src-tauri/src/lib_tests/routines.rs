//! The routines commands and event: only the main window may call them, and the generated
//! contract carries them.

use super::*;

const ROUTINES: [&str; 17] = [
    "routines_list",
    "routine_templates",
    "routine_create",
    "routine_add_template",
    "routine_update",
    "routine_move",
    "routine_remove",
    "routine_restore",
    "habit_create",
    "habit_update",
    "habit_move",
    "habit_remove",
    "habit_restore",
    "habit_check",
    "run_start",
    "run_step",
    "run_end",
];

fn permission(command: &str) -> String {
    format!("allow-{}", command.replace('_', "-"))
}

#[test]
fn routines_commands_are_in_the_manifest_and_only_main_grants_them() {
    for command in ROUTINES {
        assert!(
            COMMANDS.contains(&command),
            "{command} is not in the manifest"
        );
    }
    let (_, main) = capability("main.json");
    for command in ROUTINES {
        assert!(main.contains(&permission(command)), "main lacks {command}");
    }
    for file in ["floater.json", "capture.json", "dev.json", "overlay.json"] {
        let (_, other) = capability(file);
        for command in ROUTINES {
            assert!(
                !other.contains(&permission(command)),
                "{file} has {command}"
            );
        }
    }
}

#[test]
fn routines_changed_event_name() {
    assert_eq!(ipc::RoutinesChangedEvent::NAME, "routines-changed");
}

#[test]
fn bindings_carry_the_routines_contract() {
    let bindings = read_bindings();
    for needle in [
        "routinesList: () => typedError<RoutinesView_Serialize, RoutinesError>",
        "routineTemplates: () => typedError<TemplateView_Serialize[], RoutinesError>",
        "routineCreate: (draft: RoutineDraft_Deserialize) => typedError<string, RoutinesError>",
        "routineAddTemplate: (template: TemplateId) => typedError<string, RoutinesError>",
        "routineMove: (id: string, toIndex: number) => typedError<null, RoutinesError>",
        "habitCreate: (routineId: string | null, draft: HabitDraft_Deserialize) => typedError<string, RoutinesError>",
        "habitCheck: (id: string, done: boolean) => typedError<null, RoutinesError>",
        "routinesChanged: makeEvent<",
        "\"morningLight\"",
        "\"notDone\"",
        "todayLine: string",
        "run: RunView_Serialize | null",
        "runStart: (routineId: string) => typedError<RunView_Serialize, RoutinesError>",
        "runStep: (runId: string, outcome: StepOutcome) => typedError<RunView_Serialize, RoutinesError>",
        "runEnd: (runId: string) => typedError<RunView_Serialize, RoutinesError>",
        "notifyRoutineDue: boolean",
    ] {
        assert!(bindings.contains(needle), "bindings lack {needle}");
    }
}
