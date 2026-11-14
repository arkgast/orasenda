//! A session and its task: the optional choice, every start path, the move to Doing, the
//! cache behind `TimerView.task`, and tracked time (spec 2026-11-14, §Session ↔ task).

use super::*;
use crate::api::{
    BoardNoticeKind, Settings, StartRequest, TimerCommandError, TimerCommandErrorKind, TimerView,
};
use crate::session::test_support::{CLASSIC_END_MS, CLASSIC_MS, db};
use crate::scheduler::Host;
use crate::session::{Action, current_settings, lock, run_action_on, run_set_settings, run_state};

fn request(task: Option<&str>) -> StartRequest {
    StartRequest {
        quick: false,
        task_id: task.map(str::to_owned),
    }
}

fn start_on(host: &TestHost, task: Option<&str>) -> Result<TimerView, TimerCommandError> {
    run_action_on(host, Action::Start(request(task)))
}

fn choose(host: &TestHost, task: Option<&str>) -> Result<TimerView, TimerCommandError> {
    run_action_on(host, Action::SetTask(task.map(str::to_owned)))
}

fn task_of(host: &TestHost, id: &str) -> TaskView {
    run_board_get(host)
        .expect("reads")
        .columns
        .into_iter()
        .flat_map(|c| c.tasks)
        .find(|t| t.id == id)
        .expect("the task is on the board")
}

fn linked(view: &TimerView) -> Option<(&str, &str)> {
    view.task.as_ref().map(|t| (t.id.as_str(), t.title.as_str()))
}

fn kind_of(result: Result<TimerView, TimerCommandError>) -> TimerCommandErrorKind {
    result.expect_err("refused").kind
}

fn notices(host: &TestHost) -> Vec<(BoardNoticeKind, String)> {
    host.log()
        .take()
        .into_iter()
        .filter_map(|e| match e {
            Event::BoardNotice(n) => Some((n.kind, n.message)),
            _ => None,
        })
        .collect()
}

#[test]
fn space_start_links_chosen_task() {
    let host = host();
    let a = add(&host, "Fix sync bug", Lane::Backlog);
    let chosen = choose(&host, Some(&a.id)).expect("chooses while idle");
    assert_eq!(linked(&chosen), Some((a.id.as_str(), "Fix sync bug")));
    let last_tick = host
        .log()
        .take()
        .into_iter()
        .filter_map(|e| match e {
            Event::Tick(v) => Some(v),
            _ => None,
        })
        .last()
        .expect("choosing while idle publishes the view");
    assert_eq!(linked(&last_tick), Some((a.id.as_str(), "Fix sync bug")));

    let started = run_action_on(&host, Action::StartPauseToggle).expect("starts");
    assert_eq!(linked(&started), Some((a.id.as_str(), "Fix sync bug")));
    let task = task_of(&host, &a.id);
    assert_eq!(task.lane, Lane::Doing, "starting moves it to Doing");
    assert!(task.active, "the running task is active");
}

#[test]
fn start_without_choice_links_nothing() {
    let host = host();
    let doing = add(&host, "In Doing", Lane::Doing);
    let frog = add(&host, "The Frog", Lane::Today);
    run_task_set_frog(&host, &frog.id, true).expect("flags");
    let started = start_on(&host, None).expect("starts");
    assert_eq!(started.task, None, "nothing is chosen automatically");
    assert_eq!(task_of(&host, &doing.id).lane, Lane::Doing);
    assert_eq!(task_of(&host, &frog.id).lane, Lane::Today);
    assert!(!task_of(&host, &doing.id).active);
}

#[test]
fn choice_clears_when_task_moves_to_done() {
    let host = host();
    let a = add(&host, "A", Lane::Today);
    choose(&host, Some(&a.id)).expect("chooses");
    host.log().take();
    run_task_move(&host, &a.id, Lane::Done, 0).expect("moves");
    assert_eq!(crate::session::run_view(&host).task, None);
    assert!(
        host.log().count(|e| matches!(e, Event::Tick(v) if v.task.is_none())) >= 1,
        "the cleared choice is published"
    );
    let started = start_on(&host, None).expect("starts");
    assert_eq!(started.task, None);
}

#[test]
fn choice_clears_when_task_is_removed_and_choosing_none_clears_it() {
    let host = host();
    let a = add(&host, "A", Lane::Today);
    let b = add(&host, "B", Lane::Today);
    choose(&host, Some(&a.id)).expect("chooses");
    run_task_remove(&host, &a.id).expect("removes");
    assert_eq!(crate::session::run_view(&host).task, None);
    choose(&host, Some(&b.id)).expect("chooses");
    let cleared = choose(&host, None).expect("clears");
    assert_eq!(cleared.task, None);
    assert_eq!(start_on(&host, None).expect("starts").task, None);
}

#[test]
fn start_with_task_moves_it_to_doing() {
    let host = host();
    let a = add(&host, "A", Lane::Today);
    host.log().take();
    let started = start_on(&host, Some(&a.id)).expect("starts");
    assert_eq!(linked(&started), Some((a.id.as_str(), "A")));
    assert_eq!(task_of(&host, &a.id).lane, Lane::Doing);
    assert!(changed(&host).len() >= 1, "the board is re-emitted");
    assert!(notices(&host).is_empty(), "no toast under the limit");
}

#[test]
fn an_explicit_task_overrides_the_choice() {
    let host = host();
    let a = add(&host, "A", Lane::Today);
    let b = add(&host, "B", Lane::Today);
    choose(&host, Some(&a.id)).expect("chooses");
    let started = start_on(&host, Some(&b.id)).expect("starts");
    assert_eq!(linked(&started), Some((b.id.as_str(), "B")));
}

#[test]
fn start_over_limit_moves_longest_back_to_today() {
    let host = host();
    let first = add(&host, "Longest", Lane::Doing);
    let today = add(&host, "Already today", Lane::Today);
    let next = add(&host, "Next", Lane::Backlog);
    host.log().take();
    start_on(&host, Some(&next.id)).expect("starts");
    let board = run_board_get(&host).expect("reads");
    assert_eq!(titles(&board, Lane::Doing), ["Next"]);
    assert_eq!(
        titles(&board, Lane::Today),
        ["Longest", "Already today"],
        "the longest in Doing goes to the top of Today"
    );
    assert_eq!(task_of(&host, &first.id).lane, Lane::Today);
    assert_eq!(task_of(&host, &today.id).lane, Lane::Today);
    assert_eq!(
        notices(&host),
        [(
            BoardNoticeKind::MovedBack,
            "Moved Longest back to Today.".to_owned()
        )]
    );
}

#[test]
fn start_with_done_task_is_refused() {
    let host = host();
    let done = add(&host, "Done one", Lane::Done);
    let result = start_on(&host, Some(&done.id));
    let error = result.expect_err("refused");
    assert_eq!(error.kind, TimerCommandErrorKind::TaskDone);
    assert_eq!(error.message, "Move it out of Done first.");
    assert_eq!(
        crate::session::run_view(&host).state,
        orasenda_core::EngineState::Idle
    );
    assert_eq!(
        kind_of(choose(&host, Some(&done.id))),
        TimerCommandErrorKind::TaskDone
    );
}

#[test]
fn start_with_a_missing_or_removed_task_is_refused() {
    let host = host();
    let a = add(&host, "A", Lane::Today);
    run_task_remove(&host, &a.id).expect("removes");
    for id in [a.id.as_str(), "nope"] {
        let error = start_on(&host, Some(id)).expect_err("refused");
        assert_eq!(error.kind, TimerCommandErrorKind::TaskNotFound);
        assert_eq!(
            error.message,
            "That task is gone. Pick another or start without one."
        );
    }
    assert_eq!(
        kind_of(choose(&host, Some("nope"))),
        TimerCommandErrorKind::TaskNotFound
    );
}

#[test]
fn set_task_during_break_changes_open_focus() {
    let host = host();
    let a = add(&host, "A", Lane::Today);
    let b = add(&host, "B", Lane::Today);
    start_on(&host, Some(&a.id)).expect("starts");
    host.set_now(T0 + CLASSIC_MS);
    let in_break = run_state(&host).view;
    assert_eq!(in_break.phase, orasenda_core::Phase::Break);
    assert_eq!(linked(&in_break), Some((a.id.as_str(), "A")));
    let swapped = choose(&host, Some(&b.id)).expect("changes the task");
    assert_eq!(linked(&swapped), Some((b.id.as_str(), "B")));
    host.set_now(T0 + CLASSIC_END_MS);
    run_state(&host);
    assert_eq!(task_of(&host, &a.id).sessions, 0);
    assert_eq!(task_of(&host, &b.id).sessions, 1, "the whole session moved");
}

#[test]
fn set_task_during_a_focus_changes_the_live_session() {
    let host = host();
    let a = add(&host, "A", Lane::Today);
    let b = add(&host, "B", Lane::Today);
    start_on(&host, Some(&a.id)).expect("starts");
    let swapped = choose(&host, Some(&b.id)).expect("changes");
    assert_eq!(linked(&swapped), Some((b.id.as_str(), "B")));
    assert!(task_of(&host, &b.id).active);
    assert!(!task_of(&host, &a.id).active);
    let cleared = choose(&host, None).expect("clears");
    assert_eq!(cleared.task, None);
}

#[test]
fn row_written_grows_tracked_time() {
    let host = host();
    let a = add(&host, "A", Lane::Today);
    start_on(&host, Some(&a.id)).expect("starts");
    host.set_now(T0 + CLASSIC_MS);
    run_state(&host);
    assert_eq!(task_of(&host, &a.id).sessions, 0, "not until the break ends");
    host.log().take();
    host.set_now(T0 + CLASSIC_END_MS);
    run_state(&host);
    let boards = changed(&host);
    assert_eq!(boards.len(), 1, "one board-changed when the row is written");
    let task = task_of(&host, &a.id);
    assert_eq!(task.sessions, 1);
    assert_eq!(task.tracked_ms, CLASSIC_MS);
    assert!(!task.active, "the session is over");
}

#[test]
fn removing_linked_task_clears_link() {
    let host = host();
    let a = add(&host, "A", Lane::Today);
    start_on(&host, Some(&a.id)).expect("starts");
    host.log().take();
    run_task_remove(&host, &a.id).expect("removes");
    let view = crate::session::run_view(&host);
    assert_eq!(view.task, None, "the slot reads No task");
    assert_eq!(view.state, orasenda_core::EngineState::Running);
    assert!(host.log().count(|e| matches!(e, Event::Tick(v) if v.task.is_none())) >= 1);
    run_task_restore(&host, &a.id).expect("restores");
    assert_eq!(
        crate::session::run_view(&host).task,
        None,
        "Undo restores the task, not the link"
    );
}

#[test]
fn moving_the_running_task_out_of_doing_keeps_the_link() {
    let host = host();
    let a = add(&host, "A", Lane::Today);
    start_on(&host, Some(&a.id)).expect("starts");
    run_task_move(&host, &a.id, Lane::Done, 0).expect("moves");
    assert_eq!(
        linked(&crate::session::run_view(&host)),
        Some((a.id.as_str(), "A"))
    );
}

#[test]
fn renaming_the_linked_task_refreshes_the_cache() {
    let host = host();
    let a = add(&host, "Old", Lane::Today);
    start_on(&host, Some(&a.id)).expect("starts");
    let patch = crate::api::TaskPatchView {
        title: Some("New".into()),
        ..Default::default()
    };
    run_task_update(&host, &a.id, &patch).expect("renames");
    assert_eq!(
        linked(&crate::session::run_view(&host)),
        Some((a.id.as_str(), "New"))
    );
}

#[test]
fn a_failed_board_write_still_starts_and_reports() {
    let host = host();
    let a = add(&host, "A", Lane::Today);
    host.log().take();
    db(&lock(host.service().expect("service"))).fail_writes(true);
    let started = start_on(&host, Some(&a.id)).expect("the session starts anyway");
    assert_eq!(started.state, orasenda_core::EngineState::Running);
    assert_eq!(
        notices(&host),
        [(
            BoardNoticeKind::NotSaved,
            "The board didn't update. Try again.".to_owned()
        )]
    );
}

#[test]
fn roll_on_keeps_the_previous_sessions_task() {
    let host = host();
    let a = add(&host, "A", Lane::Today);
    let settings = Settings {
        auto_continue: true,
        ..current_settings(&host)
    };
    run_set_settings(&host, settings).expect("saves");
    let quick = StartRequest {
        quick: true,
        task_id: Some(a.id.clone()),
    };
    run_action_on(&host, Action::Start(quick)).expect("starts");
    host.set_now(T0 + 2 * MINUTE);
    let rolled = run_state(&host).view;
    assert!(!rolled.quick, "the saved preset runs now");
    assert_eq!(linked(&rolled), Some((a.id.as_str(), "A")));
}
