//! The review contract before its commands exist: the `review-changed` event and the types the
//! generated bindings carry (no placeholder commands).

use super::*;

#[test]
fn review_changed_event_name() {
    assert_eq!(ipc::ReviewChangedEvent::NAME, "review-changed");
}

#[test]
fn bindings_carry_the_review_contract() {
    let bindings = read_bindings();
    for needle in [
        "reviewChanged: makeEvent<",
        "export type ReviewView = ",
        "export type ShutdownView = ",
        "export type WeeklyView = ",
        "export type StatsView = ",
        "export type PriorityPick = ({ task: string }) & { newTitle?: never } | ({ newTitle: string }) & { task?: never };",
        "export type ReviewPrimary = \"shutdown\" | \"weekly\" | \"none\";",
        "export type StatsRange = \"week\" | \"weeks8\" | \"months6\";",
        "\"notFound\" | \n",
        "\"period\" | \n",
        "\tdots: HabitDotView[] | null,",
        "\tweekPriority: boolean,",
        "export type MoveUndo = {\n\ttoken: string,\n\tline: string,\n};",
    ] {
        assert!(bindings.contains(needle), "bindings lack {needle}");
    }
}
