use super::*;
use crate::api::BoardError;

fn frog(board: &BoardView) -> Vec<String> {
    board
        .columns
        .iter()
        .flat_map(|c| &c.tasks)
        .filter(|t| t.is_frog)
        .map(|t| t.title.clone())
        .collect()
}

#[test]
fn frog_moves_and_returns_previous() {
    let host = host();
    let a = add(&host, "A", Lane::Today);
    let b = add(&host, "B", Lane::Today);
    assert_eq!(run_task_set_frog(&host, &a.id, true), Ok(None));
    assert_eq!(frog(&run_board_get(&host).unwrap()), ["A"]);
    assert_eq!(
        run_task_set_frog(&host, &b.id, true),
        Ok(Some(a.id.clone())),
        "the previous Frog comes back for Undo"
    );
    assert_eq!(frog(&run_board_get(&host).unwrap()), ["B"]);
    run_task_set_frog(&host, &a.id, true).expect("undo");
    assert_eq!(frog(&run_board_get(&host).unwrap()), ["A"]);
    assert_eq!(run_task_set_frog(&host, &a.id, false), Ok(None));
    assert!(frog(&run_board_get(&host).unwrap()).is_empty());
    assert_eq!(run_task_set_frog(&host, "nope", true), Err(BoardError::NotFound));
}

#[test]
fn a_done_task_cannot_be_the_frog_and_yesterdays_frog_shows_nothing() {
    let host = host();
    let d = add(&host, "D", Lane::Done);
    assert_eq!(run_task_set_frog(&host, &d.id, true), Err(BoardError::DoneCannotBeFrog));
    let a = add(&host, "A", Lane::Today);
    run_task_set_frog(&host, &a.id, true).expect("sets");
    host.set_now(T0 + DAY);
    assert!(frog(&run_board_get(&host).unwrap()).is_empty());
}
