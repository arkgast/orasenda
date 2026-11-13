//! The Inbox: capture rules, the events, time labels and failures.

use orasenda_core::{HourCycle, LocalTime};
use orasenda_store::inbox_notes::{self, NoteRow};

use super::*;
use crate::api::{CaptureError, InboxError, NewCapture, NoteKind, NoteView};
use crate::session::lock;
use crate::session::test_support::*;

const HOUR: u64 = 60 * MINUTE;
const DAY: u64 = 24 * HOUR;

struct Local(i32, HourCycle);

impl LocalTime for Local {
    fn utc_offset_min(&self, _at_epoch_ms: u64) -> i32 {
        self.0
    }
    fn hour_cycle(&self) -> HourCycle {
        self.1
    }
}

fn capture(text: &str) -> NewCapture {
    NewCapture {
        text: text.into(),
        kind: NoteKind::Internal,
    }
}

fn host() -> TestHost {
    TestHost::fresh(orasenda_core::NotificationStatus::NotDetermined)
}

fn changed(host: &TestHost) -> Vec<Vec<NoteView>> {
    host.log()
        .take()
        .into_iter()
        .filter_map(|e| match e {
            Event::InboxChanged(notes) => Some(notes),
            _ => None,
        })
        .collect()
}

fn row(created_at: u64) -> NoteRow {
    NoteRow {
        id: "n".into(),
        text: "t".into(),
        kind: inbox_notes::NoteKind::External,
        created_at,
        deleted_at: None,
    }
}

#[test]
fn capture_note_trims_and_rejects_empty() {
    let host = host();
    let saved =
        run_capture_note(&host, capture("  first line\n\n  second line \n")).expect("saves");
    assert_eq!(saved.text, "first line\n\n  second line");
    assert_eq!(saved.id.len(), 36);
    assert_eq!(saved.id.as_bytes()[14], b'7', "a UUIDv7");
    for blank in ["", "   ", "\n\t \n"] {
        assert_eq!(
            run_capture_note(&host, capture(blank)),
            Err(CaptureError::Empty)
        );
    }
    assert_eq!(
        run_inbox_list(&host).expect("lists").len(),
        1,
        "a refused note writes nothing"
    );
}

#[test]
fn capture_note_too_long() {
    let host = host();
    let longest = "é".repeat(1000);
    assert!(run_capture_note(&host, capture(&format!(" {longest} "))).is_ok());
    let over = "é".repeat(1001);
    assert_eq!(
        run_capture_note(&host, capture(&over)),
        Err(CaptureError::TooLong)
    );
    assert_eq!(run_inbox_list(&host).expect("lists").len(), 1);
}

#[test]
fn capture_note_emits_inbox_changed() {
    let host = host();
    let first = run_capture_note(&host, capture("one")).expect("saves");
    host.set_now(T0 + MINUTE);
    let second = run_capture_note(&host, capture("two")).expect("saves");
    let events = changed(&host);
    assert_eq!(events.len(), 2);
    assert_eq!(events[0], std::slice::from_ref(&first));
    assert_eq!(events[1], [second, first], "newest first");
    assert_eq!(
        host.0.under_lock.load(std::sync::atomic::Ordering::SeqCst),
        0
    );
    run_capture_note(&host, capture("  ")).expect_err("refused");
    assert!(changed(&host).is_empty(), "a refused note emits nothing");
}

#[test]
fn inbox_time_labels_today_yesterday_date() {
    let now = T0 + 5 * DAY + 14 * HOUR + 32 * MINUTE;
    let utc = Local(0, HourCycle::H23);
    let at = |created: u64| note_view(&row(created), now, &utc);
    let today = at(now - 3 * HOUR);
    assert_eq!(
        (today.created_at.as_str(), today.created_at_label.as_str()),
        ("11:32", "Today at 11:32")
    );
    let yesterday = at(now - DAY);
    assert_eq!(yesterday.created_at, "Yesterday 14:32");
    assert_eq!(yesterday.created_at_label, "Yesterday at 14:32");
    let older = at(now - 10 * DAY + 5 * MINUTE);
    assert_eq!(older.created_at, "2 Nov 14:37");
    assert_eq!(older.created_at_label, "2 November at 14:37");
    // 2026-11-12 14:32 UTC itself, seen two weeks on.
    let dated = note_view(&row(now), now + 14 * DAY, &utc);
    assert_eq!(dated.created_at, "12 Nov 14:32");
    assert_eq!(dated.created_at_label, "12 November at 14:32");
    // Another year carries it.
    let old = note_view(&row(now), now + 400 * DAY, &utc);
    assert_eq!(old.created_at, "12 Nov 2026 14:32");
    // Local time moves the day: 23:30 UTC is already tomorrow two hours east.
    let east = Local(120, HourCycle::H23);
    let late = note_view(&row(now + 9 * HOUR - 2 * MINUTE), now + 9 * HOUR, &east);
    assert_eq!(late.created_at, "01:30");
    let twelve = Local(0, HourCycle::H12);
    assert_eq!(note_view(&row(now), now, &twelve).created_at, "2:32 PM");
}

#[test]
fn inbox_remove_unknown_not_found() {
    let host = host();
    assert_eq!(run_inbox_remove(&host, "nope"), Err(InboxError::NotFound));
    assert_eq!(run_inbox_restore(&host, "nope"), Err(InboxError::NotFound));
    assert!(changed(&host).is_empty());
    let note = run_capture_note(&host, capture("keep")).expect("saves");
    host.log().take();
    run_inbox_remove(&host, &note.id).expect("removes");
    assert_eq!(changed(&host), [Vec::<NoteView>::new()]);
    assert!(run_inbox_list(&host).expect("lists").is_empty());
    assert_eq!(
        run_inbox_remove(&host, &note.id),
        Err(InboxError::NotFound),
        "already removed"
    );
    run_inbox_restore(&host, &note.id).expect("restores");
    assert_eq!(changed(&host), [vec![note.clone()]]);
    assert_eq!(run_inbox_list(&host).expect("lists"), [note]);
}

#[test]
fn inbox_store_failure_is_error() {
    let host = host();
    let note = run_capture_note(&host, capture("kept")).expect("saves");
    host.log().take();
    db(&lock(&host.0.service)).fail_writes(true);
    assert_eq!(
        run_capture_note(&host, capture("lost")),
        Err(CaptureError::Store)
    );
    assert_eq!(run_inbox_remove(&host, &note.id), Err(InboxError::Store));
    assert_eq!(run_inbox_restore(&host, &note.id), Err(InboxError::Store));
    assert!(changed(&host).is_empty(), "a failure emits nothing");
    db(&lock(&host.0.service)).fail_writes(false);
    assert_eq!(
        run_inbox_list(&host).expect("lists"),
        [note],
        "the failed write left no trace"
    );
}

#[test]
fn inbox_list_store_failure_is_error() {
    let host = host();
    run_capture_note(&host, capture("kept")).expect("saves");
    db(&lock(&host.0.service)).fail_reads(true);
    assert_eq!(run_inbox_list(&host), Err(InboxError::Store));
    db(&lock(&host.0.service)).fail_reads(false);
    assert_eq!(run_inbox_list(&host).expect("lists").len(), 1);
}

#[test]
fn inbox_without_a_store_is_error() {
    let service = crate::session::SessionService::new(
        Err(orasenda_store::OpenError::Io("denied".into())),
        fakes(orasenda_core::NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    let fresh = fakes(orasenda_core::NotificationStatus::NotDetermined, false);
    let host = TestHost::with(service, fresh.log, fresh.notifier);
    assert_eq!(
        run_capture_note(&host, capture("x")),
        Err(CaptureError::Store)
    );
    assert_eq!(run_inbox_remove(&host, "x"), Err(InboxError::Store));
    assert_eq!(run_inbox_list(&host), Err(InboxError::Store));
}

#[test]
fn capture_note_answers_with_the_note_it_saved() {
    let host = host();
    host.set_now(T0 + MINUTE);
    run_capture_note(&host, capture("later")).expect("saves");
    host.set_now(T0);
    let saved = run_capture_note(&host, capture("earlier")).expect("saves");
    assert_eq!(saved.text, "earlier", "not the newest note in the list");
    let listed = run_inbox_list(&host).expect("lists");
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[1].id, saved.id, "the id is the new note's id");
}
