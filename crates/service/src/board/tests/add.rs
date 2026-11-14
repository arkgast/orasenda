use super::*;
use crate::api::{BoardError, TaskPatchView};

#[test]
fn add_trims_and_refuses_empty_title() {
    let host = host();
    let saved = add(&host, "  Write intro \n", Lane::Backlog);
    assert_eq!(saved.title, "Write intro");
    assert_eq!(saved.id.as_bytes()[14], b'7', "a UUIDv7");
    for blank in ["", "  ", "\n\t"] {
        assert_eq!(
            run_task_add(&host, draft(blank, Lane::Backlog)),
            Err(BoardError::TitleEmpty)
        );
    }
    let long = "é".repeat(201);
    assert_eq!(
        run_task_add(&host, draft(&long, Lane::Backlog)),
        Err(BoardError::TitleTooLong)
    );
    let board = run_board_get(&host).expect("reads");
    assert_eq!(
        titles(&board, Lane::Backlog),
        ["Write intro"],
        "refusals write nothing"
    );
}

#[test]
fn add_refuses_bad_fields() {
    let host = host();
    let with = |f: fn(&mut TaskDraft)| {
        let mut d = draft("t", Lane::Backlog);
        f(&mut d);
        run_task_add(&host, d)
    };
    assert_eq!(with(|d| d.estimate = Some(0)), Err(BoardError::BadEstimate));
    assert_eq!(
        with(|d| d.estimate = Some(17)),
        Err(BoardError::BadEstimate)
    );
    assert_eq!(
        with(|d| d.due = Some("2026-02-30".into())),
        Err(BoardError::BadDue)
    );
    assert_eq!(
        with(|d| d.tags = Some(vec!["a".into(), "A".into()])),
        Err(BoardError::BadTags)
    );
    assert_eq!(
        with(|d| d.tags = Some(vec!["x".into(); 9])),
        Err(BoardError::BadTags)
    );
    assert_eq!(
        with(|d| d.notes = Some("n".repeat(10_001))),
        Err(BoardError::NotesTooLong)
    );
}

#[test]
fn update_changes_and_clears_fields() {
    let host = host();
    let task = add(&host, "One", Lane::Today);
    let patch = TaskPatchView {
        title: Some(" Two ".into()),
        estimate: Some(Some(3)),
        due: Some(Some("2026-11-20".into())),
        ..TaskPatchView::default()
    };
    run_task_update(&host, &task.id, &patch).expect("updates");
    let board = run_board_get(&host).expect("reads");
    let got = &lane(&board, Lane::Today).tasks[0];
    assert_eq!((got.title.as_str(), got.estimate), ("Two", Some(3)));
    assert_eq!(got.due_label.as_deref(), Some("Due Fri 20 Nov"));
    let clear = TaskPatchView {
        estimate: Some(None),
        ..TaskPatchView::default()
    };
    run_task_update(&host, &task.id, &clear).expect("clears");
    let board = run_board_get(&host).expect("reads");
    assert_eq!(lane(&board, Lane::Today).tasks[0].estimate, None);
    assert_eq!(
        run_task_update(&host, "nope", &clear),
        Err(BoardError::NotFound)
    );
}

#[test]
fn patch_tells_absent_from_null() {
    let absent: TaskPatchView = serde_json::from_str("{}").unwrap();
    assert_eq!(absent.estimate, None);
    let null: TaskPatchView = serde_json::from_str(r#"{"estimate":null}"#).unwrap();
    assert_eq!(null.estimate, Some(None));
    let set: TaskPatchView = serde_json::from_str(r#"{"estimate":3}"#).unwrap();
    assert_eq!(set.estimate, Some(Some(3)));
}

#[test]
fn move_reorders_and_changes_lane() {
    let host = host();
    let a = add(&host, "A", Lane::Backlog);
    let b = add(&host, "B", Lane::Backlog);
    let c = add(&host, "C", Lane::Backlog);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(
        titles(&board, Lane::Backlog),
        ["A", "B", "C"],
        "new tasks go last"
    );
    run_task_move(&host, &c.id, Lane::Backlog, 0).expect("moves");
    run_task_move(&host, &a.id, Lane::Today, 0).expect("moves");
    run_task_move(&host, &b.id, Lane::Today, 0).expect("moves");
    let board = run_board_get(&host).expect("reads");
    assert_eq!(titles(&board, Lane::Backlog), ["C"]);
    assert_eq!(titles(&board, Lane::Today), ["B", "A"]);
    run_task_move(&host, &a.id, Lane::Today, 99).expect("past the end means last");
    run_task_move(&host, &a.id, Lane::Done, 0).expect("done");
    let board = run_board_get(&host).expect("reads");
    assert_eq!(lane(&board, Lane::Done).tasks[0].done_at, Some(T0));
    assert_eq!(
        run_task_move(&host, "nope", Lane::Today, 0),
        Err(BoardError::NotFound)
    );
}

#[test]
fn remove_and_restore() {
    let host = host();
    let a = add(&host, "A", Lane::Backlog);
    run_task_remove(&host, &a.id).expect("removes");
    assert!(titles(&run_board_get(&host).unwrap(), Lane::Backlog).is_empty());
    assert_eq!(run_task_remove(&host, &a.id), Err(BoardError::NotFound));
    run_task_restore(&host, &a.id).expect("restores");
    assert_eq!(titles(&run_board_get(&host).unwrap(), Lane::Backlog), ["A"]);
    assert_eq!(run_task_restore(&host, &a.id), Err(BoardError::NotFound));
}

#[test]
fn a_failed_write_is_a_store_error_not_success() {
    let host = host();
    crate::session::test_support::db(&crate::session::lock(&host.0.service)).fail_writes(true);
    assert_eq!(
        run_task_add(&host, draft("A", Lane::Backlog)),
        Err(BoardError::Store)
    );
    crate::session::test_support::db(&crate::session::lock(&host.0.service)).fail_writes(false);
    crate::session::test_support::db(&crate::session::lock(&host.0.service)).fail_reads(true);
    assert_eq!(run_board_get(&host).map(|_| ()), Err(BoardError::Store));
}
