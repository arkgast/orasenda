use std::sync::atomic::Ordering;

use orasenda_core::platform::import::SourceAccess;

use super::todoist::Scratch;
use super::*;
use crate::api::{ImportPreview, Lane as ApiLane, PreviewRequest};
use crate::import::run_import_preview;
use crate::session::test_support::FakeReminders;

fn preview(host: &TestHost, ids: &[&str]) -> ImportPreview {
    let items = ids
        .iter()
        .map(|id| reminder(id, &format!("Task {id}")))
        .collect();
    host.0
        .imports
        .set_reminders(FakeReminders::new(SourceAccess::Granted, items));
    run_import_preview(host, PreviewRequest::Reminders).expect("previews")
}

#[test]
fn match_live_in_any_lane_unselected() {
    let host = host();
    seed(&host, "t1", "reminders:a", Lane::Today, true);
    let p = preview(&host, &["a", "b"]);
    let a = &p.items[0];
    assert!(!a.selected);
    assert_eq!(a.on_board, Some(ApiLane::Today));
    assert_eq!(a.why.as_deref(), Some("Already on the Board, in Today"));
    assert!(p.items[1].selected);
    assert_eq!(p.items[1].why, None);
}

#[test]
fn match_removed_only_selected() {
    let host = host();
    seed(&host, "t1", "reminders:a", Lane::Backlog, false);
    let item = &preview(&host, &["a"]).items[0];
    assert!(item.selected);
    assert_eq!(item.on_board, None);
}

#[test]
fn match_names_first_by_lane_order() {
    let host = host();
    seed(&host, "t1", "reminders:a", Lane::Done, true);
    seed(&host, "t2", "reminders:a", Lane::Doing, true);
    seed(&host, "t3", "reminders:a", Lane::Backlog, false);
    let item = &preview(&host, &["a"]).items[0];
    assert_eq!(item.on_board, Some(ApiLane::Doing));
    assert_eq!(item.why.as_deref(), Some("Already on the Board, in Doing"));
}

#[test]
fn meta_line_words() {
    use orasenda_core::platform::import::DueParts;
    let host = host();
    let mut r = reminder("a", "Draft plan");
    r.due = Some(DueParts {
        date: Some("2026-11-20".into()),
        time: None,
    });
    let source = FakeReminders::new(SourceAccess::Granted, vec![r, reminder("b", "Plain")]);
    host.0.imports.set_reminders(source.clone());
    let p = run_import_preview(&host, PreviewRequest::Reminders).unwrap();
    assert_eq!(p.items[0].meta, "Home · Due Fri 20 Nov");
    assert_eq!(p.items[1].meta, "Home");
    assert_eq!(source.reads.load(Ordering::SeqCst), 1);
}

#[test]
fn meta_line_tags_due_and_checklist() {
    let host = host();
    let dir = Scratch::new("meta");
    let path = dir.0.join("Work.csv");
    let text = "TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,DATE,DEADLINE\n\
        section,Planning,,,,,\n\
        task,Plan,,,1,2026-11-20,\n\
        task,a,,,2,,\ntask,b,,,2,,\ntask,c,,,2,,\ntask,d,,,2,,\n\
        task,Solo,,,1,,\ntask,only,,,2,,\n";
    std::fs::write(&path, text).unwrap();
    let p = run_import_preview(&host, PreviewRequest::Todoist(path)).unwrap();
    assert_eq!(
        p.items[0].meta,
        "Work · Planning · Due Fri 20 Nov · 4 checklist items"
    );
    assert_eq!(p.items[1].meta, "Work · Planning · 1 checklist item");
}
