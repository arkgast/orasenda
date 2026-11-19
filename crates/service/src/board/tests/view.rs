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
    let names: Vec<_> = board
        .columns
        .iter()
        .map(|c| (c.lane.clone(), c.name.as_str(), c.limit))
        .collect();
    assert_eq!(
        names,
        [
            (Lane::BACKLOG, "Backlog", None),
            (Lane::TODAY, "Today", Some(3)),
            (Lane::DOING, "Doing", Some(1)),
            (Lane::DONE, "Done", None),
        ]
    );
    let states = |board: &BoardView| {
        (
            lane(board, Lane::TODAY).state,
            lane(board, Lane::DOING).state,
        )
    };
    assert_eq!(states(&board), (LimitState::Under, LimitState::Under));
    for n in 0..2 {
        add(&host, &format!("t{n}"), Lane::TODAY);
    }
    add(&host, "d", Lane::DOING);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(states(&board), (LimitState::Under, LimitState::At));
    add(&host, "t2", Lane::TODAY);
    add(&host, "d2", Lane::DOING);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(states(&board), (LimitState::At, LimitState::Over));
    add(&host, "t3", Lane::TODAY);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(lane(&board, Lane::TODAY).state, LimitState::Over);
    assert_eq!(
        lane(&board, Lane::TODAY).count,
        4,
        "limits inform, never block"
    );
    assert_eq!(lane(&board, Lane::BACKLOG).state, LimitState::Under);
}

#[test]
fn done_shows_last_14_days() {
    let host = host();
    add(&host, "old", Lane::DONE);
    host.set_now(T0 + 5 * DAY);
    add(&host, "mid", Lane::DONE);
    host.set_now(T0 + 6 * DAY);
    add(&host, "new", Lane::DONE);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(
        titles(&board, Lane::DONE),
        ["new", "mid", "old"],
        "newest first"
    );
    host.set_now(T0 + 13 * DAY);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(
        titles(&board, Lane::DONE),
        ["new", "mid", "old"],
        "the 14th local day is still in"
    );
    host.set_now(T0 + 14 * DAY);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(
        titles(&board, Lane::DONE),
        ["new", "mid"],
        "the window moves at local midnight"
    );
    assert_eq!(lane(&board, Lane::DONE).count, 2);
    host.set_now(T0 + 40 * DAY);
    assert!(titles(&run_board_get(&host).unwrap(), Lane::DONE).is_empty());
}

#[test]
fn planned_rounds_up_with_buffer() {
    let host = host();
    let a = add(&host, "A", Lane::TODAY);
    let b = add(&host, "B", Lane::TODAY);
    let c = add(&host, "C", Lane::TODAY);
    add(&host, "none", Lane::TODAY);
    let elsewhere = add(&host, "E", Lane::BACKLOG);
    estimate(&host, &a.id, 3);
    estimate(&host, &b.id, 4);
    estimate(&host, &c.id, 1);
    estimate(&host, &elsewhere.id, 8);
    let board = run_board_get(&host).expect("reads");
    let planned: Vec<_> = lane(&board, Lane::TODAY)
        .tasks
        .iter()
        .map(|t| t.planned)
        .collect();
    assert_eq!(
        planned,
        [Some(4), Some(5), Some(2), None],
        "ceil(est * 1.25)"
    );
    assert_eq!(board.buffer, 25);
    assert_eq!(board.today_planned, 11, "only Today's estimated tasks");
    let mut settings = lock(&host.0.service).settings();
    settings.board_estimate_buffer = 30;
    lock(&host.0.service)
        .set_settings(settings, T0)
        .expect("saves");
    let board = run_board_get(&host).expect("reads");
    let planned: Vec<_> = lane(&board, Lane::TODAY)
        .tasks
        .iter()
        .map(|t| t.planned)
        .collect();
    assert_eq!(
        planned,
        [Some(4), Some(6), Some(2), None],
        "ceil(est * 1.3)"
    );
    assert_eq!(board.today_planned, 12);
}

#[test]
fn due_words_and_tracked() {
    let host = host();
    let t = add(&host, "A", Lane::TODAY);
    let label = |due: &str| {
        let patch = TaskPatchView {
            due: Some(Some(due.into())),
            ..TaskPatchView::default()
        };
        run_task_update(&host, &t.id, &patch).expect("updates");
        let board = run_board_get(&host).expect("reads");
        lane(&board, Lane::TODAY).tasks[0]
            .due_label
            .clone()
            .unwrap()
    };
    assert_eq!(label("2026-11-07"), "Due today");
    assert_eq!(label("2026-11-06"), "Due yesterday");
    assert_eq!(label("2026-11-08"), "Due tomorrow");
    assert_eq!(label("2026-11-20"), "Due Fri 20 Nov");
    assert_eq!(label("2025-01-02"), "Due Thu 2 Jan 2025");
    let board = run_board_get(&host).expect("reads");
    let task = &lane(&board, Lane::TODAY).tasks[0];
    assert_eq!(
        (task.tracked.as_str(), task.sessions, task.active),
        ("0h 00m", 0, false)
    );
}
