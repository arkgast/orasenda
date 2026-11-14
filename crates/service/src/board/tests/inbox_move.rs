use super::*;
use crate::api::{BoardError, InboxError, NewCapture, NoteKind};
use crate::inbox::{run_capture_note, run_inbox_list};

fn note(host: &TestHost, text: &str) -> String {
    let n = NewCapture {
        text: text.into(),
        kind: NoteKind::Internal,
    };
    run_capture_note(host, n).expect("saves").id
}

fn inbox_events(host: &TestHost) -> usize {
    host.log().count(|e| matches!(e, Event::InboxChanged(_)))
}

#[test]
fn inbox_to_task_moves_note_in_one_txn() {
    let host = host();
    let id = note(&host, "Call the dentist about the crown");
    host.log().take();
    let task = run_inbox_to_task(&host, &id).expect("moves");
    assert_eq!(task.title, "Call the dentist about the crown");
    assert_eq!(task.lane, Lane::Backlog);
    assert_eq!(task.source_note_id.as_deref(), Some(id.as_str()));
    assert!(
        run_inbox_list(&host).unwrap().is_empty(),
        "the note is gone"
    );
    let log = host.log().take();
    assert_eq!(
        log.iter()
            .filter(|e| matches!(e, Event::InboxChanged(_)))
            .count(),
        1
    );
    assert_eq!(
        log.iter()
            .filter(|e| matches!(e, Event::BoardChanged(..)))
            .count(),
        1
    );
    assert_eq!(
        run_inbox_to_task(&host, &id),
        Err(BoardError::NotFound),
        "no second task"
    );
    assert_eq!(
        titles(&run_board_get(&host).unwrap(), Lane::Backlog).len(),
        1
    );
}

#[test]
fn a_long_note_is_cut_on_a_word_and_the_rest_goes_to_notes() {
    let host = host();
    let words = vec!["word"; 80].join(" ");
    let id = note(&host, &words);
    let task = run_inbox_to_task(&host, &id).expect("moves");
    assert!(task.title.chars().count() <= 200);
    assert!(task.title.ends_with("word"), "cut on a boundary");
    assert_eq!(format!("{} {}", task.title, task.notes), words);
    let id = note(&host, &"x".repeat(300));
    let task = run_inbox_to_task(&host, &id).expect("moves");
    assert_eq!(task.title.chars().count(), 200, "no space: a hard cut");
    assert_eq!(task.notes.chars().count(), 100);
}

#[test]
fn restore_note_reverses_move() {
    let host = host();
    let id = note(&host, "Buy stamps");
    let task = run_inbox_to_task(&host, &id).expect("moves");
    host.log().take();
    run_task_restore_note(&host, &task.id).expect("reverses");
    assert_eq!(run_inbox_list(&host).unwrap().len(), 1, "the note is back");
    assert!(titles(&run_board_get(&host).unwrap(), Lane::Backlog).is_empty());
    assert_eq!(inbox_events(&host), 1);
    assert_eq!(
        run_task_restore_note(&host, &task.id),
        Err(BoardError::NotFound)
    );
    let plain = add(&host, "Plain", Lane::Backlog);
    assert_eq!(
        run_task_restore_note(&host, &plain.id),
        Err(BoardError::NotFound)
    );
    let _ = InboxError::NotFound;
}

#[test]
fn a_failed_write_keeps_the_note() {
    let host = host();
    let id = note(&host, "Keep me");
    crate::session::test_support::db(&crate::session::lock(&host.0.service)).fail_writes(true);
    assert_eq!(run_inbox_to_task(&host, &id), Err(BoardError::Store));
    crate::session::test_support::db(&crate::session::lock(&host.0.service)).fail_writes(false);
    assert_eq!(run_inbox_list(&host).unwrap().len(), 1);
}
