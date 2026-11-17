//! `weekly_save` and `weekly_complete`: typed picks, the limits, the period, the events and
//! `weekPriority`.

use std::sync::atomic::Ordering;

use super::support::{DAY, HOUR, host};
use crate::api::{BoardView, Lane, PriorityPick, ReviewError, TaskDraft, WeeklyDraft, WeeklyView};
use crate::board::{run_board_get, run_task_add};
use crate::review::{run_weekly_complete, run_weekly_save};
use crate::session::test_support::{Event, T0, TestHost};

/// Local `hour`:00 on the day `days` after Saturday 7 November 2026 (UTC+1).
fn at(days: u64, hour: u64) -> u64 {
    T0 + days * DAY + (hour - 1) * HOUR
}

fn draft(picks: Vec<PriorityPick>) -> WeeklyDraft {
    WeeklyDraft {
        improvement: None,
        notes: None,
        priorities: picks,
    }
}

fn typed(title: &str) -> PriorityPick {
    PriorityPick::NewTitle(title.into())
}

fn add(host: &TestHost, title: &str) -> String {
    let draft = TaskDraft {
        title: title.into(),
        lane: Some(Lane::Backlog),
        ..TaskDraft::default()
    };
    run_task_add(host, draft).expect("task added").id
}

fn board(host: &TestHost) -> BoardView {
    run_board_get(host).expect("the board")
}

fn backlog_titles(host: &TestHost) -> Vec<String> {
    let board = board(host);
    let column = board.columns.iter().find(|c| c.lane == Lane::Backlog);
    column.map_or_else(Vec::new, |c| {
        c.tasks.iter().map(|t| t.title.clone()).collect()
    })
}

fn save(host: &TestHost, week: &str, picks: Vec<PriorityPick>) -> Result<WeeklyView, ReviewError> {
    run_weekly_save(host, week.into(), draft(picks))
}

fn ids(view: &WeeklyView) -> Vec<String> {
    view.answers
        .priorities
        .iter()
        .map(|p| p.task_id.clone())
        .collect()
}

#[test]
fn typed_pick_creates_one_task_across_saves() {
    let host = host();
    let first = save(&host, "2026-11-09", vec![typed("  Write the plan ")]).expect("saved");
    assert_eq!(first.answers.priorities.len(), 1);
    assert_eq!(first.answers.priorities[0].title, "Write the plan");
    // Back and Continue again: the webview sends the id it was given.
    let id = ids(&first);
    let again = save(&host, "2026-11-09", vec![PriorityPick::Task(id[0].clone())]).expect("saved");
    assert_eq!(ids(&again), id);
    assert_eq!(backlog_titles(&host), ["Write the plan"]);
}

#[test]
fn new_task_in_same_transaction() {
    let host = host();
    add(&host, "Already here");
    let view = save(&host, "2026-11-09", vec![typed("Second")]).expect("saved");
    // At the end of Backlog, and the reflection holds its id.
    assert_eq!(backlog_titles(&host), ["Already here", "Second"]);
    assert_eq!(view.answers.priorities[0].line, "Second · Backlog");
    // A pick that fails takes the typed one with it: nothing is created.
    let refused = save(
        &host,
        "2026-11-09",
        vec![typed("Third"), PriorityPick::Task("missing".into())],
    );
    assert_eq!(refused, Err(ReviewError::NotFound));
    assert_eq!(backlog_titles(&host), ["Already here", "Second"]);
    // Two typed titles keep their order in Backlog and in the view.
    let view = save(&host, "2026-11-09", vec![typed("Fourth"), typed("Fifth")]).expect("saved");
    assert_eq!(
        backlog_titles(&host),
        ["Already here", "Second", "Fourth", "Fifth"]
    );
    assert_eq!(ids(&view).len(), 2);
    let lines: Vec<_> = view
        .answers
        .priorities
        .iter()
        .map(|p| p.line.as_str())
        .collect();
    assert_eq!(lines, ["Fourth · Backlog", "Fifth · Backlog"]);
}

#[test]
fn fourth_pick_full() {
    let host = host();
    let picks = vec![typed("A"), typed("B"), typed("C"), typed("D")];
    assert_eq!(save(&host, "2026-11-09", picks), Err(ReviewError::Full));
    assert!(backlog_titles(&host).is_empty());
}

#[test]
fn blank_title_empty() {
    let host = host();
    assert_eq!(
        save(&host, "2026-11-09", vec![typed("   ")]),
        Err(ReviewError::Empty)
    );
    let long = "x".repeat(201);
    assert_eq!(
        save(&host, "2026-11-09", vec![typed("Fine"), typed(&long)]),
        Err(ReviewError::TooLong)
    );
    assert!(backlog_titles(&host).is_empty());
    let limit = "x".repeat(200);
    save(&host, "2026-11-09", vec![typed(&limit)]).expect("200 characters fit");
}

#[test]
fn duplicate_pick_kept_once() {
    let host = host();
    let id = add(&host, "Pick me");
    let picks = vec![
        PriorityPick::Task(id.clone()),
        PriorityPick::Task(id.clone()),
        typed("Same"),
        typed(" Same "),
    ];
    let view = save(&host, "2026-11-09", picks).expect("saved");
    assert_eq!(view.answers.priorities.len(), 2);
    assert_eq!(view.answers.priorities[0].task_id, id);
    assert_eq!(backlog_titles(&host), ["Pick me", "Same"]);
}

#[test]
fn absent_field_writes_null() {
    let host = host();
    let full = WeeklyDraft {
        improvement: Some(" Start earlier ".into()),
        notes: Some("Some notes".into()),
        priorities: Vec::new(),
    };
    let view = run_weekly_save(&host, "2026-11-09".into(), full).expect("saved");
    assert_eq!(view.answers.improvement.as_deref(), Some("Start earlier"));
    assert_eq!(view.answers.notes.as_deref(), Some("Some notes"));
    let half = WeeklyDraft {
        improvement: Some("   ".into()),
        notes: None,
        priorities: Vec::new(),
    };
    let view = run_weekly_save(&host, "2026-11-09".into(), half).expect("saved");
    assert_eq!(view.answers.improvement, None);
    assert_eq!(view.answers.notes, None);
    let long = WeeklyDraft {
        improvement: Some("x".repeat(201)),
        ..WeeklyDraft::default()
    };
    assert_eq!(
        run_weekly_save(&host, "2026-11-09".into(), long),
        Err(ReviewError::TooLong)
    );
    let long_notes = WeeklyDraft {
        notes: Some("x".repeat(2_001)),
        ..WeeklyDraft::default()
    };
    assert_eq!(
        run_weekly_save(&host, "2026-11-09".into(), long_notes),
        Err(ReviewError::TooLong)
    );
}

#[test]
fn weekly_period_two_back_refused() {
    let host = host();
    // Saturday: the planned week is 9 November, the one before is 2 November.
    save(&host, "2026-11-02", vec![]).expect("the week before is accepted");
    assert_eq!(save(&host, "2026-10-26", vec![]), Err(ReviewError::Period));
    assert_eq!(
        run_weekly_complete(&host, "2026-10-26".into(), draft(vec![])),
        Err(ReviewError::Period)
    );
    assert_eq!(
        save(&host, "2026-10-26", vec![typed("Nope")]),
        Err(ReviewError::Period)
    );
    assert!(backlog_titles(&host).is_empty());
}

fn kinds(host: &TestHost) -> (usize, usize) {
    let events = host.log().take();
    let review = events
        .iter()
        .filter(|e| matches!(e, Event::ReviewChanged(_)))
        .count();
    let board = events
        .iter()
        .filter(|e| matches!(e, Event::BoardChanged(..)))
        .count();
    (review, board)
}

#[test]
fn weekly_save_emits_review_changed() {
    let host = host();
    host.log().take();
    save(&host, "2026-11-09", vec![]).expect("saved");
    // Saturday: the planned week is not the current one and nothing was created.
    assert_eq!(kinds(&host), (1, 0));
    run_weekly_complete(&host, "2026-11-09".into(), draft(vec![])).expect("completed");
    assert_eq!(kinds(&host), (1, 0));
    assert_eq!(host.0.under_lock.load(Ordering::SeqCst), 0);
    // A typed title creates a task: the board follows.
    save(&host, "2026-11-09", vec![typed("New")]).expect("saved");
    assert_eq!(kinds(&host), (1, 1));
    assert_eq!(host.0.under_lock.load(Ordering::SeqCst), 0);
    // A refusal emits nothing.
    save(&host, "2026-10-26", vec![]).expect_err("refused");
    assert_eq!(kinds(&host), (0, 0));
}

#[test]
fn week_priority_current_not_planned_on_friday() {
    let host = host();
    let planned = add(&host, "For next week");
    let current = add(&host, "For this week");
    host.set_now(at(6, 12));
    // Friday 13 November: this week starts 9 November, next week 16 November.
    save(
        &host,
        "2026-11-16",
        vec![PriorityPick::Task(planned.clone())],
    )
    .expect("saved");
    save(
        &host,
        "2026-11-09",
        vec![PriorityPick::Task(current.clone())],
    )
    .expect("saved");
    let board = board(&host);
    let flag = |id: &str| {
        board
            .columns
            .iter()
            .flat_map(|c| &c.tasks)
            .find(|t| t.id == id)
            .map(|t| t.week_priority)
    };
    assert_eq!(flag(&planned), Some(false));
    assert_eq!(flag(&current), Some(true));
}

#[test]
fn complete_emits_board_changed_for_current_week() {
    let host = host();
    let id = add(&host, "This week");
    // Monday 9 November: the planned week is the current week.
    host.set_now(at(2, 12));
    host.log().take();
    let view = run_weekly_complete(
        &host,
        "2026-11-09".into(),
        draft(vec![PriorityPick::Task(id.clone())]),
    )
    .expect("completed");
    assert!(view.completed_line.is_some());
    let events = host.log().take();
    let shown = events.iter().find_map(|e| match e {
        Event::BoardChanged(_, board) => board
            .columns
            .iter()
            .flat_map(|c| &c.tasks)
            .find(|t| t.id == id)
            .map(|t| t.week_priority),
        _ => None,
    });
    assert_eq!(shown, Some(true));
}
