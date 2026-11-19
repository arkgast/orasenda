//! A lane that isn't a column is refused (`ColumnNotFound`); Start works from a custom column.

use super::*;
use crate::api::{BoardError, StartRequest};
use crate::session::{Action, run_action_on};

fn gone() -> Lane {
    Lane::parse("c_gone0001").expect("an id")
}

#[test]
fn add_to_unknown_lane_refused() {
    let host = host();
    assert_eq!(
        run_task_add(&host, draft("A", gone())),
        Err(BoardError::ColumnNotFound)
    );
    assert!(changed(&host).is_empty());
    assert!(
        titles(&run_board_get(&host).expect("reads"), Lane::BACKLOG).is_empty(),
        "nothing was saved"
    );
}

#[test]
fn move_to_unknown_lane_refused() {
    let host = host();
    let a = add(&host, "A", Lane::BACKLOG);
    changed(&host);
    assert_eq!(
        run_task_move(&host, &a.id, gone(), 0),
        Err(BoardError::ColumnNotFound)
    );
    assert!(changed(&host).is_empty());
    let board = run_board_get(&host).expect("reads");
    assert_eq!(titles(&board, Lane::BACKLOG), ["A"]);
}

#[test]
fn move_within_a_custom_column_reorders() {
    let host = host();
    let custom = run_board_column_add(&host, Lane::TODAY).expect("adds");
    let a = add(&host, "A", custom.clone());
    add(&host, "B", custom.clone());
    run_task_move(&host, &a.id, custom.clone(), 1).expect("reorders");
    let board = run_board_get(&host).expect("reads");
    assert_eq!(titles(&board, custom), ["B", "A"]);
}

fn start(host: &TestHost, id: &str) {
    let request = StartRequest {
        quick: false,
        task_id: Some(id.to_owned()),
    };
    run_action_on(host, Action::Start(request)).expect("starts");
}

#[test]
fn start_from_custom_moves_to_doing() {
    let host = host();
    let custom = run_board_column_add(&host, Lane::TODAY).expect("adds");
    let a = add(&host, "A", custom.clone());
    start(&host, &a.id);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(titles(&board, Lane::DOING), ["A"]);
    assert!(titles(&board, custom).is_empty());
}

#[test]
fn start_from_custom_over_limit_bumps_to_today() {
    let host = host();
    let custom = run_board_column_add(&host, Lane::TODAY).expect("adds");
    let limit = usize::from(
        lane(&run_board_get(&host).expect("reads"), Lane::DOING)
            .limit
            .expect("Doing has a limit"),
    );
    let first = add(&host, "Longest", Lane::DOING);
    for n in 1..limit {
        add(&host, &format!("Doing {n}"), Lane::DOING);
    }
    let next = add(&host, "Next", custom.clone());
    start(&host, &next.id);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(titles(&board, Lane::TODAY), ["Longest"]);
    assert!(titles(&board, Lane::DOING).contains(&"Next".to_owned()));
    assert_ne!(first.id, next.id);
}
