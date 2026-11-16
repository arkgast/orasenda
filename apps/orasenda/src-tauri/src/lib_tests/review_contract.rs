//! The review contract before its commands exist: the `review-changed` event and the types the
//! generated bindings carry (no placeholder commands).

use super::*;

#[test]
fn review_changed_event_name() {
    assert_eq!(ipc::ReviewChangedEvent::NAME, "review-changed");
}

#[test]
fn bindings_carry_the_review_contract() {
    let bindings = std::fs::read_to_string(bindings_path()).unwrap();
    for needle in [
        "reviewChanged: makeEvent<",
        "export type ReviewView = ",
        "export type ShutdownView = ",
        "export type WeeklyView = ",
        "export type StatsView = ",
        "export type PriorityPick = { task: string } | { newTitle: string }",
        "export type ReviewPrimary = \"shutdown\" | \"weekly\" | \"none\"",
        "export type StatsRange = \"week\" | \"weeks8\" | \"months6\"",
        "export type ReviewError = \"notFound\" | \"tooLong\" | \"full\" | \"empty\" | \"period\" | \"store\"",
        "dots: HabitDotView[] | null",
        "weekPriority: boolean",
        "export type MoveUndo = { token: string; line: string }",
    ] {
        assert!(bindings.contains(needle), "bindings lack {needle}");
    }
}
