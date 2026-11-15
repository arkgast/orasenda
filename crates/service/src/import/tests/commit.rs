use orasenda_core::rank;

use super::*;
use crate::api::{ImportErrorKind, ImportSourceKind};
use crate::import::{run_import_discard, run_import_preview, run_task_import};
use crate::session::test_support::{Event, FakeReminders};

fn changed(host: &TestHost) -> usize {
    host.log().count(|e| matches!(e, Event::BoardChanged(..)))
}

fn pending_id(host: &TestHost) -> Option<u64> {
    lock(host.service().unwrap())
        .import_pending
        .as_ref()
        .map(|p| p.id)
}

#[test]
fn import_appends_in_source_order() {
    let host = host();
    seed(&host, "tomb", "x:1", Lane::Backlog, false);
    let p = preview_reminders(&host, 3);
    let done = run_task_import(&host, p.id, vec![2, 0, 1]).unwrap();
    assert_eq!(done.count, 3);
    let rows = live_tasks(&host);
    let titles: Vec<_> = rows.iter().map(|r| r.title.as_str()).collect();
    assert_eq!(titles, ["T0", "T1", "T2"]);
    // After the removed task's rank, so no tie, and spread shaped.
    assert!(rows.iter().all(|r| r.rank.as_str() > "tomb"));
    assert_eq!(
        rows.iter().map(|r| r.rank.clone()).collect::<Vec<_>>(),
        rank::spread(Some("tomb"), 3)
    );
    assert!(rows.iter().all(|r| r.lane == Lane::Backlog));
}

#[test]
fn import_logs_origin_and_emits_after_lock() {
    let host = host();
    let p = preview_reminders(&host, 2);
    let before = changed(&host);
    run_task_import(&host, p.id, vec![0, 1]).unwrap();
    assert_eq!(changed(&host), before + 1);
    assert!(host.log().count(|_| true) > 0);
    let rows = live_tasks(&host);
    assert_eq!(rows[0].origin.as_deref(), Some("reminders:r0"));
    assert_eq!(rows[1].origin.as_deref(), Some("reminders:r1"));
}

#[test]
fn import_applies_the_fitted_clamps() {
    let host = host();
    host.0.imports.set_reminders(FakeReminders::new(
        orasenda_core::platform::import::SourceAccess::Granted,
        vec![reminder("r0", &"w".repeat(300))],
    ));
    let p = run_import_preview(&host, crate::api::PreviewRequest::Reminders).unwrap();
    run_task_import(&host, p.id, vec![0]).unwrap();
    let rows = live_tasks(&host);
    assert!(rows[0].title.chars().count() <= crate::board::check::MAX_TITLE);
}

#[test]
fn import_consumes_the_preview_and_records_the_last_import() {
    let host = host();
    let p = preview_reminders(&host, 2);
    let done = run_task_import(&host, p.id, vec![0]).unwrap();
    assert_eq!(pending_id(&host), None);
    let guard = lock(host.service().unwrap());
    let last = guard.import_last.as_ref().unwrap();
    assert_eq!(last.id, done.import_id);
    assert_eq!(last.task_ids.len(), 1);
}

#[test]
fn import_empty_keys_is_stale() {
    let host = host();
    let p = preview_reminders(&host, 2);
    let error = run_task_import(&host, p.id, vec![]).unwrap_err();
    assert_eq!(error.kind, ImportErrorKind::Stale);
    assert!(live_tasks(&host).is_empty());
    assert_eq!(pending_id(&host), Some(p.id));
}

#[test]
fn import_unknown_key_is_stale() {
    let host = host();
    let p = preview_reminders(&host, 2);
    let error = run_task_import(&host, p.id, vec![0, 9]).unwrap_err();
    assert_eq!(error.kind, ImportErrorKind::Stale);
    assert!(live_tasks(&host).is_empty());
    assert_eq!(changed(&host), 0);
}

#[test]
fn import_after_discard_is_stale() {
    let host = host();
    let p = preview_reminders(&host, 2);
    run_import_discard(&host, p.id);
    let error = run_task_import(&host, p.id, vec![0]).unwrap_err();
    assert_eq!(error.kind, ImportErrorKind::Stale);
    assert_eq!(
        run_task_import(&host, 987_654, vec![0]).unwrap_err().kind,
        ImportErrorKind::Stale
    );
    assert!(live_tasks(&host).is_empty());
}

#[test]
fn failed_write_keeps_preview() {
    let host = host();
    let p = preview_reminders(&host, 2);
    crate::session::test_support::db(&lock(host.service().unwrap())).fail_writes(true);
    let error = run_task_import(&host, p.id, vec![0]).unwrap_err();
    assert_eq!(error.kind, ImportErrorKind::Store);
    crate::session::test_support::db(&lock(host.service().unwrap())).fail_writes(false);
    assert_eq!(pending_id(&host), Some(p.id));
    assert!(lock(host.service().unwrap()).import_last.is_none());
    assert_eq!(changed(&host), 0);
    assert_eq!(run_task_import(&host, p.id, vec![0]).unwrap().count, 1);
}

#[test]
fn import_after_board_change_uses_current_last_rank() {
    let host = host();
    let p = preview_reminders(&host, 1);
    seed(&host, "zzz", "x:1", Lane::Backlog, true);
    run_task_import(&host, p.id, vec![0]).unwrap();
    let rows = live_tasks(&host);
    let imported = rows.iter().find(|r| r.title == "T0").unwrap();
    assert!(imported.rank.as_str() > "zzz");
}

#[test]
fn todoist_import_while_session_active() {
    let host = host();
    let path = std::env::temp_dir().join(format!("orasenda-i7b-{}.csv", std::process::id()));
    std::fs::write(
        &path,
        "TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE\\n\\
         task,Pay rent,,4,1,,,,en,\\n",
    )
    .unwrap();
    let p = run_import_preview(&host, crate::api::PreviewRequest::Todoist(path.clone())).unwrap();
    assert_eq!(p.source, ImportSourceKind::Todoist);
    start_session(&host);
    let done = run_task_import(&host, p.id, vec![0]).unwrap();
    assert_eq!(done.count, 1);
    let _ = std::fs::remove_file(path);
    assert_eq!(live_tasks(&host)[0].title, "Pay rent");
}
