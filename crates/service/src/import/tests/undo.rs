use super::*;
use crate::api::{ImportErrorKind, ImportSourceKind};
use crate::board::run_task_remove;
use crate::import::{run_import_open_settings, run_task_import, run_task_import_undo};
use crate::session::test_support::Event;

#[test]
fn undo_tombstones_last_import() {
    let host = host();
    seed(&host, "mine", "x:1", Lane::Backlog, true);
    let p = preview_reminders(&host, 3);
    let done = run_task_import(&host, p.id, vec![0, 1, 2]).unwrap();
    let before = host.log().count(|e| matches!(e, Event::BoardChanged(..)));
    assert_eq!(run_task_import_undo(&host, done.import_id), Ok(3));
    assert_eq!(
        host.log().count(|e| matches!(e, Event::BoardChanged(..))),
        before + 1
    );
    let rows = live_tasks(&host);
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].id, "mine");
}

#[test]
fn undo_skips_already_removed() {
    let host = host();
    let p = preview_reminders(&host, 3);
    let done = run_task_import(&host, p.id, vec![0, 1, 2]).unwrap();
    let first = live_tasks(&host)[0].id.clone();
    run_task_remove(&host, &first).unwrap();
    assert_eq!(run_task_import_undo(&host, done.import_id), Ok(2));
    assert!(live_tasks(&host).is_empty());
}

#[test]
fn undo_other_id_is_stale() {
    let host = host();
    let p = preview_reminders(&host, 1);
    let done = run_task_import(&host, p.id, vec![0]).unwrap();
    let error = run_task_import_undo(&host, done.import_id + 1000).unwrap_err();
    assert_eq!(error.kind, ImportErrorKind::Stale);
    assert_eq!(live_tasks(&host).len(), 1);
    let fresh = host_without_import();
    assert_eq!(
        run_task_import_undo(&fresh, 1).unwrap_err().kind,
        ImportErrorKind::Stale
    );
}

fn host_without_import() -> TestHost {
    host()
}

#[test]
fn open_settings_todoist_unavailable() {
    let host = host();
    let error = run_import_open_settings(&host, ImportSourceKind::Todoist).unwrap_err();
    assert_eq!(error.kind, ImportErrorKind::Unavailable);
}

#[test]
fn open_settings_calls_the_source() {
    let host = host();
    preview_reminders(&host, 1);
    assert_eq!(
        run_import_open_settings(&host, ImportSourceKind::Reminders),
        Ok(())
    );
    // No Things on this host: nothing to open.
    assert_eq!(
        run_import_open_settings(&host, ImportSourceKind::Things)
            .unwrap_err()
            .kind,
        ImportErrorKind::Unavailable
    );
}
