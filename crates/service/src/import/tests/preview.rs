use std::io::Write;
use std::sync::atomic::Ordering;

use orasenda_core::PlatformError;
use orasenda_core::platform::import::{SourceAccess, ThingsReadError};

use super::*;
use crate::api::{ImportErrorKind, ImportSourceKind, PreviewRequest};
use crate::import::{run_import_discard, run_import_preview};
use crate::session::test_support::{Event, FakeReminders, FakeThings};

fn board_rows(host: &TestHost) -> usize {
    let guard = lock(host.service().unwrap());
    guard
        .store()
        .unwrap()
        .read(|txn| Ok(tasks::list_live(txn)?.len()))
        .unwrap()
}

fn reminders(host: &TestHost, access: SourceAccess, n: usize) -> std::sync::Arc<FakeReminders> {
    let items = (0..n)
        .map(|i| reminder(&format!("r{i}"), &format!("T{i}")))
        .collect();
    let source = FakeReminders::new(access, items);
    host.0.imports.set_reminders(source.clone());
    source
}

fn pending_id(host: &TestHost) -> Option<u64> {
    lock(host.service().unwrap())
        .import_pending
        .as_ref()
        .map(|p| p.id)
}

#[test]
fn preview_writes_nothing() {
    let host = host();
    reminders(&host, SourceAccess::Granted, 3);
    let before = host.log().count(|_| true);
    let p = run_import_preview(&host, PreviewRequest::Reminders).unwrap();
    assert_eq!(p.items.len(), 3);
    assert_eq!(board_rows(&host), 0);
    assert_eq!(host.log().count(|_| true), before);
    assert_eq!(
        host.log().count(|e| matches!(e, Event::BoardChanged(..))),
        0
    );
    assert_eq!(pending_id(&host), Some(p.id));
}

#[test]
fn preview_asks_only_when_not_asked() {
    let host = host();
    let source = reminders(&host, SourceAccess::NotAsked, 1);
    run_import_preview(&host, PreviewRequest::Reminders).unwrap();
    assert_eq!(source.requests.load(Ordering::SeqCst), 1);
    run_import_preview(&host, PreviewRequest::Reminders).unwrap();
    assert_eq!(source.requests.load(Ordering::SeqCst), 1);
}

#[test]
fn preview_denied_is_denied_error() {
    let host = host();
    let source = reminders(&host, SourceAccess::Denied, 1);
    let error = run_import_preview(&host, PreviewRequest::Reminders).unwrap_err();
    assert_eq!(error.kind, ImportErrorKind::Denied);
    assert_eq!(
        error.message,
        "Orasenda can't read your reminders. You can allow it in System Settings."
    );
    assert_eq!(source.requests.load(Ordering::SeqCst), 0);
    assert_eq!(source.reads.load(Ordering::SeqCst), 0);
}

#[test]
fn preview_things_timeout_line() {
    let host = host();
    host.0
        .imports
        .set_things(FakeThings::new(Err(ThingsReadError::TimedOut)));
    let error = run_import_preview(&host, PreviewRequest::Things).unwrap_err();
    assert_eq!(error.kind, ImportErrorKind::TimedOut);
    assert_eq!(
        error.message,
        "Things didn't answer. If macOS asked for permission, answer it, then try again."
    );
}

#[test]
fn preview_reminders_timeout_line() {
    let host = host();
    let source = reminders(&host, SourceAccess::Granted, 0);
    *source.read.lock().unwrap() = Err(PlatformError::Other("timed out".into()));
    let error = run_import_preview(&host, PreviewRequest::Reminders).unwrap_err();
    assert_eq!(
        error.message,
        "Orasenda couldn't read your reminders. Try again."
    );
    assert_eq!(error.kind, ImportErrorKind::Unreadable);
}

#[test]
fn things_empty_source_line() {
    let host = host();
    host.0.imports.set_things(FakeThings::new(Ok("[]".into())));
    let p = run_import_preview(&host, PreviewRequest::Things).unwrap();
    assert_eq!((p.total, p.items.len()), (0, 0));
    assert!(p.summary.is_empty());
    let json = r#"[{"id":"A","name":"X","notes":"","project":null,"area":null,"tagNames":"","dueDate":null,"activationDate":null}]"#;
    host.0.imports.set_things(FakeThings::new(Ok(json.into())));
    let p = run_import_preview(&host, PreviewRequest::Things).unwrap();
    assert_eq!(
        p.summary,
        vec!["Things doesn't share checklists, so they stay in Things."]
    );
    assert_eq!(p.source, ImportSourceKind::Things);
}

#[test]
fn preview_caps_at_500_new_first() {
    let host = host();
    for i in 0..5 {
        seed(
            &host,
            &format!("t{i}"),
            &format!("reminders:r{i}"),
            Lane::BACKLOG,
            true,
        );
    }
    reminders(&host, SourceAccess::Granted, 812);
    let p = run_import_preview(&host, PreviewRequest::Reminders).unwrap();
    assert_eq!((p.items.len(), p.total), (500, 812));
    assert_eq!(
        p.summary[0],
        "Showing 500 of 812. Import these, then choose Import tasks again for the rest."
    );
    assert!(p.items.iter().all(|i| i.selected));
    assert!(p.items.iter().all(|i| i.on_board.is_none()));
    let keys: Vec<u32> = p.items.iter().map(|i| i.key).collect();
    assert!(keys.windows(2).all(|w| w[0] < w[1]));
}

#[test]
fn discard_drops_only_matching_id() {
    let host = host();
    reminders(&host, SourceAccess::Granted, 1);
    let p = run_import_preview(&host, PreviewRequest::Reminders).unwrap();
    run_import_discard(&host, p.id + 100);
    assert_eq!(pending_id(&host), Some(p.id));
    run_import_discard(&host, p.id);
    assert_eq!(pending_id(&host), None);
}

#[test]
fn todoist_preview_while_session_active() {
    let host = host();
    let dir = std::env::temp_dir().join(format!("orasenda-i7a-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("Home.csv");
    std::fs::File::create(&path)
        .unwrap()
        .write_all(b"TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT\ntask,Pay rent,,4,1\n")
        .unwrap();
    start_session(&host);
    let p = run_import_preview(&host, PreviewRequest::Todoist(path.clone())).unwrap();
    assert_eq!(p.items.len(), 1);
    reminders(&host, SourceAccess::Granted, 1);
    let error = run_import_preview(&host, PreviewRequest::Reminders).unwrap_err();
    assert_eq!(error.kind, ImportErrorKind::SessionActive);
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn older_preview_finishing_later_does_not_replace_newer() {
    let host = host();
    reminders(&host, SourceAccess::Granted, 1);
    let first = run_import_preview(&host, PreviewRequest::Reminders).unwrap();
    // A newer id was handed out meanwhile: a read finishing now is the older one.
    lock(host.service().unwrap()).import_last_issued = first.id + 10;
    run_import_preview(&host, PreviewRequest::Reminders).unwrap();
    // The second request is older than the newest id, so it installs nothing.
    assert_eq!(pending_id(&host), Some(first.id));
}

#[test]
fn older_read_does_not_bring_back_a_discarded_preview() {
    let host = host();
    reminders(&host, SourceAccess::Granted, 1);
    let first = run_import_preview(&host, PreviewRequest::Reminders).unwrap();
    lock(host.service().unwrap()).import_last_issued = first.id + 10;
    run_import_discard(&host, first.id);
    run_import_preview(&host, PreviewRequest::Reminders).unwrap();
    assert_eq!(pending_id(&host), None);
}

#[test]
fn zip_with_non_exports_adds_archive_line() {
    use zip::write::{SimpleFileOptions, ZipWriter};
    let host = host();
    let dir = super::todoist::Scratch::new("archive");
    let path = dir.0.join("Backup.zip");
    let mut zip = ZipWriter::new(std::fs::File::create(&path).unwrap());
    let good = "TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT\ntask,Pay rent,,4,1\n";
    for (name, body) in [
        ("Home.csv", good),
        ("x.csv", "a,b\n1,2\n"),
        ("y.csv", "c\n3\n"),
    ] {
        zip.start_file(name, SimpleFileOptions::default()).unwrap();
        zip.write_all(body.as_bytes()).unwrap();
    }
    zip.finish().unwrap();
    let p = run_import_preview(&host, PreviewRequest::Todoist(path.clone())).unwrap();
    assert_eq!(
        p.summary,
        vec!["2 files in the archive weren't Todoist exports."]
    );
    let mut zip = ZipWriter::new(std::fs::File::create(&path).unwrap());
    for (name, body) in [("Home.csv", good), ("x.csv", "a,b\n1,2\n")] {
        zip.start_file(name, SimpleFileOptions::default()).unwrap();
        zip.write_all(body.as_bytes()).unwrap();
    }
    zip.finish().unwrap();
    let p = run_import_preview(&host, PreviewRequest::Todoist(path)).unwrap();
    assert_eq!(
        p.summary,
        vec!["1 file in the archive wasn't a Todoist export."]
    );
}
