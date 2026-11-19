//! The column commands: add, remove, edit and their refusals.

use super::*;
use crate::api::BoardError;

fn view(host: &TestHost) -> BoardView {
    run_board_get(host).expect("reads")
}

fn names(host: &TestHost) -> Vec<String> {
    view(host).columns.into_iter().map(|c| c.name).collect()
}

fn state(host: &TestHost) -> Vec<(String, String, Option<u8>)> {
    view(host)
        .columns
        .into_iter()
        .map(|c| (c.lane.as_str().to_owned(), c.name, c.limit))
        .collect()
}

fn add_after(host: &TestHost, after: Lane) -> Lane {
    run_board_column_add(host, after).expect("adds")
}

#[test]
fn add_inserts_after_and_names() {
    let host = host();
    let first = add_after(&host, Lane::TODAY);
    assert!(first.as_str().starts_with("c_"), "{first:?}");
    assert_eq!(first.as_str().len(), 10);
    assert_eq!(
        names(&host),
        ["Backlog", "Today", "New column", "Doing", "Done"]
    );
    let board = view(&host);
    let made = lane(&board, first.clone());
    assert!(made.custom && !made.folded);
    assert_eq!((made.limit, made.count), (None, 0));
    assert!(!lane(&board, Lane::TODAY).custom);
    let second = add_after(&host, first.clone());
    assert_ne!(second, first);
    assert_eq!(
        names(&host),
        [
            "Backlog",
            "Today",
            "New column",
            "New column 2",
            "Doing",
            "Done"
        ]
    );
}

#[test]
fn add_refuses_at_cap() {
    let host = host();
    for _ in 0..4 {
        add_after(&host, Lane::BACKLOG);
    }
    changed(&host);
    assert_eq!(
        run_board_column_add(&host, Lane::BACKLOG),
        Err(BoardError::TooManyColumns)
    );
    assert!(changed(&host).is_empty());
    assert_eq!(view(&host).columns.len(), 8);
}

#[test]
fn add_refuses_after_done() {
    let host = host();
    assert_eq!(
        run_board_column_add(&host, Lane::DONE),
        Err(BoardError::BadColumns)
    );
    let unknown = Lane::parse("c_zzzzzzzz").expect("an id");
    assert_eq!(
        run_board_column_add(&host, unknown),
        Err(BoardError::BadColumns)
    );
    assert_eq!(view(&host).columns.len(), 4);
}

#[test]
fn remove_refuses_non_empty() {
    let host = host();
    let custom = add_after(&host, Lane::TODAY);
    let task = add(&host, "A", custom.clone());
    assert_eq!(
        run_board_column_remove(&host, custom.clone()),
        Err(BoardError::ColumnNotEmpty)
    );
    run_task_remove(&host, &task.id).expect("removes the task");
    run_board_column_remove(&host, custom).expect("empty now");
    assert_eq!(view(&host).columns.len(), 4);
}

#[test]
fn remove_refuses_builtin() {
    let host = host();
    for builtin in [Lane::BACKLOG, Lane::TODAY, Lane::DOING, Lane::DONE] {
        assert_eq!(
            run_board_column_remove(&host, builtin),
            Err(BoardError::BadColumns)
        );
    }
}

#[test]
fn remove_unknown_not_found() {
    let host = host();
    let unknown = Lane::parse("c_zzzzzzzz").expect("an id");
    assert_eq!(
        run_board_column_remove(&host, unknown),
        Err(BoardError::ColumnNotFound)
    );
}

#[test]
fn edit_saves_name_and_limit_per_kind() {
    let host = host();
    let custom = add_after(&host, Lane::DOING);
    run_board_column_edit(&host, custom.clone(), "  Review ".into(), Some(4)).expect("custom");
    run_board_column_edit(&host, Lane::TODAY, "Now".into(), Some(9)).expect("today");
    run_board_column_edit(&host, Lane::DOING, "Busy".into(), Some(3)).expect("doing");
    run_board_column_edit(&host, Lane::DONE, "Finished".into(), None).expect("done");
    run_board_column_edit(&host, custom.clone(), "Review".into(), None).expect("no limit");
    let rows = state(&host);
    assert_eq!(rows[1], ("today".into(), "Now".into(), Some(9)));
    assert_eq!(rows[3], (custom.as_str().into(), "Review".into(), None));
    assert_eq!(rows[4].1, "Finished");
}

#[test]
fn edit_refuses_duplicate_name() {
    let host = host();
    let custom = add_after(&host, Lane::BACKLOG);
    for taken in ["today", "TODAY", " Backlog "] {
        assert_eq!(
            run_board_column_edit(&host, custom.clone(), taken.into(), None),
            Err(BoardError::BadColumnName)
        );
    }
    for bad in ["", "   ", &"x".repeat(25)] {
        assert_eq!(
            run_board_column_edit(&host, custom.clone(), bad.into(), None),
            Err(BoardError::BadColumnName)
        );
    }
    run_board_column_edit(&host, custom.clone(), "x".repeat(24), None).expect("24 is fine");
    run_board_column_edit(&host, custom, "x".repeat(24), None).expect("its own name is not taken");
}

#[test]
fn edit_limit_ranges_per_kind() {
    let host = host();
    let custom = add_after(&host, Lane::BACKLOG);
    let cases = [
        (Lane::TODAY, "Today", None),
        (Lane::TODAY, "Today", Some(0)),
        (Lane::TODAY, "Today", Some(10)),
        (Lane::DOING, "Doing", Some(4)),
        (Lane::DOING, "Doing", None),
        (Lane::BACKLOG, "Backlog", Some(2)),
        (Lane::DONE, "Done", Some(1)),
        (custom, "New column", Some(10)),
    ];
    for (lane, name, limit) in cases {
        assert_eq!(
            run_board_column_edit(&host, lane.clone(), name.into(), limit),
            Err(BoardError::BadLimit),
            "{lane:?} {limit:?}"
        );
    }
}

#[test]
fn edit_unknown_not_found() {
    let host = host();
    let unknown = Lane::parse("c_zzzzzzzz").expect("an id");
    assert_eq!(
        run_board_column_edit(&host, unknown, "X".into(), None),
        Err(BoardError::ColumnNotFound)
    );
}

#[test]
fn edit_refused_changes_nothing() {
    let host = host();
    let before = state(&host);
    changed(&host);
    assert_eq!(
        run_board_column_edit(&host, Lane::TODAY, "Renamed".into(), Some(12)),
        Err(BoardError::BadLimit)
    );
    assert_eq!(
        run_board_column_edit(&host, Lane::TODAY, "doing".into(), Some(2)),
        Err(BoardError::BadColumnName)
    );
    assert_eq!(state(&host), before);
    assert!(changed(&host).is_empty(), "a refusal emits nothing");
}

#[test]
fn tasks_go_to_and_from_an_existing_custom_column() {
    let host = host();
    let custom = add_after(&host, Lane::TODAY);
    let a = add(&host, "A", custom.clone());
    let b = add(&host, "B", Lane::BACKLOG);
    run_task_move(&host, &b.id, custom.clone(), 0).expect("moves in");
    let board = view(&host);
    assert_eq!(titles(&board, custom.clone()), ["B", "A"]);
    assert_eq!(lane(&board, custom.clone()).count, 2);
    assert_eq!(a.lane, custom);
    let gone = Lane::parse("c_zzzzzzzz").expect("an id");
    assert_eq!(
        run_task_move(&host, &b.id, gone, 0),
        Err(BoardError::ColumnNotFound),
        "an unknown column is still refused"
    );
}
