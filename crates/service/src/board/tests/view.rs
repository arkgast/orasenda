use super::*;
use crate::api::{LimitState, TaskPatchView};
use crate::session::lock;

fn estimate(host: &TestHost, id: &str, n: u8) {
    let patch = TaskPatchView {
        estimate: Some(Some(n)),
        ..TaskPatchView::default()
    };
    run_task_update(host, id, &patch).expect("updates");
}

#[test]
fn limit_states_for_today_and_doing() {
    let host = host();
    let board = run_board_get(&host).expect("reads");
    let names: Vec<_> = board.columns.iter().map(|c| (c.lane, c.name.as_str(), c.limit)).collect();
    assert_eq!(
        names,
        [
            (Lane::Backlog, "Backlog", None),
            (Lane::Today, "Today", Some(3)),
            (Lane::Doing, "Doing", Some(1)),
            (Lane::Done, "Done", None),
        ]
    );
    let states = |board: &BoardView| {
        (lane(board, Lane::Today).state, lane(board, Lane::Doing).state)
    };
    assert_eq!(states(&board), (LimitState::Under, LimitState::Under));
    for n in 0..2 {
        add(&host, &format!("t{n}"), Lane::Today);
    }
    add(&host, "d", Lane::Doing);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(states(&board), (LimitState::Under, LimitState::At));
    add(&host, "t2", Lane::Today);
    add(&host, "d2", Lane::Doing);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(states(&board), (LimitState::At, LimitState::Over));
    add(&host, "t3", Lane::Today);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(lane(&board, Lane::Today).state, LimitState::Over);
    assert_eq!(lane(&board, Lane::Today).count, 4, "limits inform, never block");
    assert_eq!(lane(&board, Lane::Backlog).state, LimitState::Under);
}

#[test]
fn done_shows_last_14_days() {
    let host = host();
    add(&host, "old", Lane::Done);
    host.set_now(T0 + 5 * DAY);
    add(&host, "mid", Lane::Done);
    host.set_now(T0 + 6 * DAY);
    add(&host, "new", Lane::Done);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(titles(&board, Lane::Done), ["new", "mid", "old"], "newest first");
    host.set_now(T0 + 14 * DAY);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(titles(&board, Lane::Done), ["new", "mid"], "14 days is the edge");
    assert_eq!(lane(&board, Lane::Done).count, 2);
    host.set_now(T0 + 40 * DAY);
    assert!(titles(&run_board_get(&host).unwrap(), Lane::Done).is_empty());
}

#[test]
fn planned_rounds_up_with_buffer() {
    let host = host();
    let a = add(&host, "A", Lane::Today);
    let b = add(&host, "B", Lane::Today);
    let c = add(&host, "C", Lane::Today);
    add(&host, "none", Lane::Today);
    let elsewhere = add(&host, "E", Lane::Backlog);
    estimate(&host, &a.id, 3);
    estimate(&host, &b.id, 4);
    estimate(&host, &c.id, 1);
    estimate(&host, &elsewhere.id, 8);
    let board = run_board_get(&host).expect("reads");
    let planned: Vec<_> = lane(&board, Lane::Today).tasks.iter().map(|t| t.planned).collect();
    assert_eq!(planned, [Some(4), Some(5), Some(2), None], "ceil(est * 1.25)");
    assert_eq!(board.buffer, 25);
    assert_eq!(board.today_planned, 11, "only Today's estimated tasks");
    let mut settings = lock(&host.0.service).settings();
    settings.board_estimate_buffer = 30;
    lock(&host.0.service).set_settings(settings, T0).expect("saves");
    let board = run_board_get(&host).expect("reads");
    let planned: Vec<_> = lane(&board, Lane::Today).tasks.iter().map(|t| t.planned).collect();
    assert_eq!(planned, [Some(4), Some(6), Some(2), None], "ceil(est * 1.3)");
    assert_eq!(board.today_planned, 12);
}

#[test]
fn due_words_and_tracked() {
    let host = host();
    let t = add(&host, "A", Lane::Today);
    let label = |due: &str| {
        let patch = TaskPatchView {
            due: Some(Some(due.into())),
            ..TaskPatchView::default()
        };
        run_task_update(&host, &t.id, &patch).expect("updates");
        let board = run_board_get(&host).expect("reads");
        lane(&board, Lane::Today).tasks[0].due_label.clone().unwrap()
    };
    assert_eq!(label("2026-11-07"), "Due today");
    assert_eq!(label("2026-11-06"), "Due yesterday");
    assert_eq!(label("2026-11-08"), "Due tomorrow");
    assert_eq!(label("2026-11-20"), "Due Fri 20 Nov");
    assert_eq!(label("2025-01-02"), "Due Thu 2 Jan 2025");
    let board = run_board_get(&host).expect("reads");
    let task = &lane(&board, Lane::Today).tasks[0];
    assert_eq!((task.tracked.as_str(), task.sessions, task.active), ("0h 00m", 0, false));
}
