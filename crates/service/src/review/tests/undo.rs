//! `shutdown_move` and `shutdown_move_undo`: one write, one token, ten minutes.

use super::shutdown::{add, lane_of};
use super::support::host;
use crate::api::{Lane, ReviewError, StartRequest};
use crate::review::{run_shutdown_get, run_shutdown_move, run_shutdown_move_undo};
use crate::session::test_support::{Event, MINUTE, T0, TestHost};
use crate::session::{Action, run_action_on};

fn setup(host: &TestHost) -> (String, String) {
    let a = add(host, "Write", Lane::Today);
    let b = add(host, "Read", Lane::Doing);
    host.set_now(T0 + 12 * 60 * MINUTE);
    (a, b)
}

#[test]
fn move_and_undo_restore() {
    let host = host();
    let (a, b) = setup(&host);
    let undo = run_shutdown_move(&host, vec![a.clone(), b.clone()]).expect("moves");
    assert_eq!(undo.line, "Moved 2 tasks to Backlog.");
    assert_eq!(lane_of(&host, &a), Lane::Backlog);
    assert_eq!(lane_of(&host, &b), Lane::Backlog);
    let line = run_shutdown_move_undo(&host, &undo.token).expect("undoes");
    assert_eq!(line, "Put 2 tasks back.");
    assert_eq!(lane_of(&host, &a), Lane::Today);
    assert_eq!(lane_of(&host, &b), Lane::Doing);
    // The token is spent.
    assert_eq!(
        run_shutdown_move_undo(&host, &undo.token),
        Err(ReviewError::NotFound)
    );
}

#[test]
fn undo_expired_not_found() {
    let host = host();
    let (a, _) = setup(&host);
    let undo = run_shutdown_move(&host, vec![a.clone()]).expect("moves");
    host.set_now(T0 + 12 * 60 * MINUTE + 10 * MINUTE);
    assert_eq!(
        run_shutdown_move_undo(&host, &undo.token),
        Err(ReviewError::NotFound)
    );
    assert_eq!(lane_of(&host, &a), Lane::Backlog);
}

#[test]
fn undo_still_works_just_before_ten_minutes() {
    let host = host();
    let (a, _) = setup(&host);
    let undo = run_shutdown_move(&host, vec![a.clone()]).expect("moves");
    host.set_now(T0 + 12 * 60 * MINUTE + 10 * MINUTE - 1);
    assert_eq!(
        run_shutdown_move_undo(&host, &undo.token).as_deref(),
        Ok("Put 1 task back.")
    );
}

#[test]
fn undo_replaced_not_found() {
    let host = host();
    let (a, b) = setup(&host);
    let first = run_shutdown_move(&host, vec![a.clone()]).expect("moves");
    let second = run_shutdown_move(&host, vec![b.clone()]).expect("moves again");
    assert_ne!(first.token, second.token);
    assert_eq!(
        run_shutdown_move_undo(&host, &first.token),
        Err(ReviewError::NotFound)
    );
    assert_eq!(
        run_shutdown_move_undo(&host, "made-up"),
        Err(ReviewError::NotFound)
    );
    assert_eq!(lane_of(&host, &a), Lane::Backlog);
    run_shutdown_move_undo(&host, &second.token).expect("the latest works");
    assert_eq!(lane_of(&host, &b), Lane::Doing);
}

#[test]
fn move_skips_task_with_running_session() {
    let host = host();
    let (a, b) = setup(&host);
    let start = StartRequest {
        quick: true,
        task_id: Some(a.clone()),
    };
    run_action_on(&host, Action::Start(start)).expect("starts");
    host.set_now(T0 + 12 * 60 * MINUTE);
    let view = run_shutdown_get(&host).expect("the shutdown");
    let active: Vec<_> = view
        .unfinished
        .iter()
        .map(|task| (task.id.as_str(), task.active))
        .collect();
    assert!(active.contains(&(a.as_str(), true)));
    let undo = run_shutdown_move(&host, vec![a.clone(), b.clone()]).expect("moves");
    assert_eq!(undo.line, "Moved 1 task to Backlog.");
    assert_ne!(lane_of(&host, &a), Lane::Backlog);
    assert_eq!(lane_of(&host, &b), Lane::Backlog);
    // Only the running task: nothing to move.
    assert_eq!(
        run_shutdown_move(&host, vec![a]),
        Err(ReviewError::NotFound)
    );
}

#[test]
fn move_emits_board_changed_after_unlock() {
    let host = host();
    let (a, _) = setup(&host);
    host.log().take();
    run_shutdown_move(&host, vec![a]).expect("moves");
    let events = host.log().take();
    let board = events
        .iter()
        .filter(|event| matches!(event, Event::BoardChanged(..)))
        .count();
    let review = events
        .iter()
        .filter(|event| matches!(event, Event::ReviewChanged(_)))
        .count();
    assert_eq!((board, review), (1, 1));
    assert_eq!(
        host.0.under_lock.load(std::sync::atomic::Ordering::SeqCst),
        0
    );
}

#[test]
fn undo_emits_both_events_after_unlock() {
    let host = host();
    let (a, _) = setup(&host);
    let undo = run_shutdown_move(&host, vec![a]).expect("moves");
    host.log().take();
    run_shutdown_move_undo(&host, &undo.token).expect("undoes");
    let events = host.log().take();
    assert_eq!(
        events
            .iter()
            .filter(|event| matches!(event, Event::BoardChanged(..) | Event::ReviewChanged(_)))
            .count(),
        2
    );
    assert_eq!(
        host.0.under_lock.load(std::sync::atomic::Ordering::SeqCst),
        0
    );
}

#[test]
fn undo_leaves_removed_task_removed() {
    let host = host();
    let (a, b) = setup(&host);
    let undo = run_shutdown_move(&host, vec![a.clone(), b.clone()]).expect("moves");
    crate::board::run_task_remove(&host, &a).expect("removed");
    let line = run_shutdown_move_undo(&host, &undo.token).expect("undoes");
    assert_eq!(line, "Put 1 task back.");
    assert_eq!(lane_of(&host, &b), Lane::Doing);
}
