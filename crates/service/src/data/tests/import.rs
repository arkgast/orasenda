use std::path::{Path, PathBuf};

use orasenda_core::{NotificationStatus, PresetDef, PresetId, default_presets};
use orasenda_store::inbox_notes::{self, NewNote, NoteKind};
use orasenda_store::portability::{Counts, counts};
use orasenda_store::presets::{self, StoredPreset};
use orasenda_store::{RawDb, SCHEMA_VERSION, Store, settings};

use super::super::backups::{folder, list};
use super::super::import::run_import;
use super::{TempDir, open, set_user_version};
use crate::api::{BackupKind, DataErrorKind, StartRequest, Theme};
use crate::scheduler::Host;
use crate::session::test_support::{Event, TestHost, fakes};
use crate::session::{Action, SessionService, lock};

const V1_SQL: &str = include_str!("../../../../store/migrations/0001_init.sql");

fn host_in(dir: &Path) -> TestHost {
    let fakes = fakes(NotificationStatus::NotDetermined, false);
    let service = SessionService::new(Ok(open(dir)), fakes.platform, 1_794_009_600_000);
    TestHost::with(service, fakes.log, fakes.notifier)
}

/// A second Orasenda data file in its own dir, written by `fill`.
fn source(fill: impl FnOnce(&Store)) -> (TempDir, PathBuf) {
    let dir = TempDir::new();
    let store = crate::session::open_store_at(dir.path(), "device-b").expect("source opens");
    fill(&store);
    drop(store);
    let path = dir.path().join("orasenda.db");
    (dir, path)
}

fn note(store: &Store, id: &str, at: u64) {
    let new = NewNote {
        id: id.into(),
        text: format!("note {id}"),
        kind: NoteKind::Internal,
        created_at: at,
    };
    store
        .write(at, |txn| inbox_notes::insert(txn, &new))
        .expect("note written");
}

fn live_counts(host: &TestHost) -> Counts {
    let guard = lock(host.service().unwrap());
    guard.store().unwrap().read(counts).expect("counts")
}

fn log_rows(dir: &Path) -> i64 {
    RawDb::open(&dir.join("orasenda.db")).count("SELECT count(*) FROM change_log")
}

fn leftovers(dir: &Path) -> Vec<String> {
    std::fs::read_dir(dir)
        .unwrap()
        .flatten()
        .filter_map(|e| e.file_name().to_str().map(str::to_owned))
        .filter(|name| name.starts_with("import-"))
        .collect()
}

fn start_session(host: &TestHost) {
    let ids = || orasenda_core::SessionId("s1".into());
    lock(host.service().unwrap()).apply(
        Action::Start(StartRequest { quick: false }),
        host.now_ms(),
        ids,
    );
}

#[test]
fn import_busy_refused_no_backup() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let (_keep, path) = source(|s| note(s, "n1", 5));
    start_session(&host);
    assert!(super::super::busy(&host));
    let error = run_import(&host, dir.path(), &path).unwrap_err();
    assert_eq!(error.kind, DataErrorKind::Busy);
    assert!(list(dir.path()).is_empty());
    assert!(!folder(dir.path()).exists());
    assert_eq!(live_counts(&host).notes, 0);
    assert!(leftovers(dir.path()).is_empty());
}

#[test]
fn import_busy_while_paused() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let (_keep, path) = source(|s| note(s, "n1", 5));
    start_session(&host);
    lock(host.service().unwrap()).apply(Action::Pause, host.now_ms(), || {
        orasenda_core::SessionId("s2".into())
    });
    assert!(super::super::busy(&host));
    let log = log_rows(dir.path());
    let error = run_import(&host, dir.path(), &path).unwrap_err();
    assert_eq!(error.kind, DataErrorKind::Busy);
    assert_eq!(live_counts(&host).notes, 0);
    assert_eq!(log_rows(dir.path()), log);
}

#[test]
fn import_newer_refused_unchanged() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let (_keep, path) = source(|s| note(s, "n1", 5));
    set_user_version(&path, SCHEMA_VERSION + 1);
    let log = log_rows(dir.path());
    let error = run_import(&host, dir.path(), &path).unwrap_err();
    assert_eq!(error.kind, DataErrorKind::Newer);
    assert!(!folder(dir.path()).exists());
    assert_eq!(live_counts(&host).notes, 0);
    assert_eq!(log_rows(dir.path()), log);
    assert!(leftovers(dir.path()).is_empty());
}

#[test]
fn import_not_orasenda() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let log = log_rows(dir.path());
    let text = dir.path().join("text.db");
    std::fs::write(&text, "not a database at all").unwrap();
    let blank = dir.path().join("blank.db");
    RawDb::open(&blank).exec("CREATE TABLE t (a)");
    let missing = dir.path().join("missing.db");
    let kinds: Vec<_> = [&text, &blank, &missing]
        .iter()
        .map(|p| run_import(&host, dir.path(), p).unwrap_err().kind)
        .collect();
    assert_eq!(
        kinds,
        [
            DataErrorKind::NotOrasenda,
            DataErrorKind::NotOrasenda,
            DataErrorKind::Unreadable
        ]
    );
    let v1 = dir.path().join("v1-no-device.db");
    RawDb::open(&v1).exec(V1_SQL);
    set_user_version(&v1, 1);
    assert_eq!(
        run_import(&host, dir.path(), &v1).unwrap_err().kind,
        DataErrorKind::NotOrasenda
    );
    assert!(!folder(dir.path()).exists());
    assert_eq!(live_counts(&host).notes, 0);
    assert_eq!(log_rows(dir.path()), log);
    assert!(leftovers(dir.path()).is_empty());
}

#[test]
fn import_from_v1_fixture_migrates_copy_only() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let old = TempDir::new();
    let path = old.path().join("old.db");
    {
        let conn = RawDb::open(&path);
        conn.exec(V1_SQL);
        conn.exec(
            "PRAGMA user_version = 1;
             INSERT INTO meta (key, value) VALUES ('device_id', 'old');
             INSERT INTO setting (key, value, updated_at) VALUES ('ui.theme', '\"dark\"', 9999999999999);",
        );
    }
    let before = std::fs::read(&path).unwrap();
    let report = run_import(&host, dir.path(), &path).expect("imports");
    assert_eq!(report.added.settings + report.updated.settings, 1);
    assert_eq!(std::fs::read(&path).unwrap(), before);
    assert_eq!(RawDb::open(&path).count("PRAGMA user_version"), 1);
    assert_eq!(host.service().map(|_| lock_theme(&host)), Some(Theme::Dark));
    assert!(leftovers(dir.path()).is_empty());
}

fn lock_theme(host: &TestHost) -> Theme {
    lock(host.service().unwrap()).settings().theme
}

#[test]
fn import_source_file_unchanged() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let (src, path) = source(|s| note(s, "n1", 5));
    let before = std::fs::read(&path).unwrap();
    run_import(&host, dir.path(), &path).expect("imports");
    assert_eq!(std::fs::read(&path).unwrap(), before);
    let siblings = std::fs::read_dir(src.path()).unwrap().count();
    assert_eq!(siblings, 1, "no -wal or -shm appeared beside the source");
    assert_eq!(live_counts(&host).notes, 1);
}

#[test]
fn import_takes_backup_first() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let (_keep, path) = source(|s| note(s, "n1", 5));
    run_import(&host, dir.path(), &path).expect("imports");
    let backups = list(dir.path());
    assert_eq!(backups.len(), 1);
    assert_eq!(backups[0].kind, BackupKind::BeforeImport);
    let copy = TempDir::new();
    let file = copy.path().join("b.db");
    std::fs::copy(folder(dir.path()).join(&backups[0].file), &file).unwrap();
    let backup = Store::open(&file, "x").expect("backup opens");
    assert_eq!(
        backup.read(counts).unwrap().notes,
        0,
        "taken before the merge"
    );
    assert_eq!(live_counts(&host).notes, 1);
}

#[test]
fn import_twice_second_is_noop() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let (_keep, path) = source(|s| {
        note(s, "n1", 5);
        s.write(7, |txn| settings::set(txn, "ui.theme", &"dark"))
            .unwrap();
    });
    let first = run_import(&host, dir.path(), &path).expect("imports");
    assert_eq!(first.added.notes, 1);
    let log = log_rows(dir.path());
    host.log().take();
    let second = run_import(&host, dir.path(), &path).expect("imports again");
    assert_eq!((second.added, second.updated), Default::default());
    assert_eq!(log_rows(dir.path()), log);
    assert_eq!(
        list(dir.path()).len(),
        2,
        "the backup is taken even when nothing is new"
    );
}

#[test]
fn import_preset_cap_keeps_selected() {
    cap_keeps_selected(None);
}

#[test]
fn import_preset_cap_keeps_legacy_selected() {
    cap_keeps_selected(Some("classic"));
}

fn cap_keeps_selected(stored_id: Option<&str>) {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let selected = default_presets()[1].id.clone();
    let (_keep, path) = source(|s| {
        if let Some(id) = stored_id {
            s.write(5, |txn| settings::set(txn, "timer.preset", &id))
                .unwrap();
        }
        for i in 0..12u64 {
            let def = PresetDef {
                id: PresetId(format!("p{i:02}")),
                name: format!("Mine {i}"),
                focus_min: 30,
                break_min: 5,
                long_break_min: 15,
                rounds: 4,
                default_key: None,
            };
            let stored = StoredPreset {
                def,
                position: 10 + i as u32,
                deleted_at: None,
            };
            s.write(1_794_009_700_000 + i * 1000, |txn| {
                presets::insert(txn, &stored)
            })
            .unwrap();
        }
    });
    run_import(&host, dir.path(), &path).expect("imports");
    let guard = lock(host.service().unwrap());
    let live = guard.presets();
    assert_eq!(live.len(), 12);
    assert!(
        live.iter().any(|p| p.id == selected),
        "the selected one stays"
    );
    assert!(live.iter().any(|p| p.id.0 == "p11"));
    assert!(
        !live.iter().any(|p| p.id.0 == "p00"),
        "the oldest unselected goes"
    );
    assert_eq!(guard.settings().preset_id, selected);
}

#[test]
fn import_emits_changes_and_applies_theme() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let (_keep, path) = source(|s| {
        note(s, "n1", 5);
        s.write(9_999_999_999_999, |txn| {
            settings::set(txn, "ui.theme", &"dark")
        })
        .unwrap();
    });
    host.log().take();
    run_import(&host, dir.path(), &path).expect("imports");
    let events = host.log().take();
    assert!(events.contains(&Event::ApplyTheme(Theme::Dark)));
    assert!(
        events
            .iter()
            .any(|e| matches!(e, Event::SettingsChanged(s) if s.theme == Theme::Dark))
    );
    assert!(events.iter().any(|e| matches!(e, Event::PresetsChanged(_))));
    assert!(
        events
            .iter()
            .any(|e| matches!(e, Event::InboxChanged(n) if n.len() == 1))
    );
    assert_eq!(
        host.0.under_lock.load(std::sync::atomic::Ordering::SeqCst),
        0
    );
}

#[test]
fn import_without_notes_does_not_emit_inbox() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let (_keep, path) = source(|s| {
        s.write(9_999_999_999_999, |txn| {
            settings::set(txn, "ui.theme", &"light")
        })
        .unwrap();
    });
    host.log().take();
    run_import(&host, dir.path(), &path).expect("imports");
    let events = host.log().take();
    assert!(!events.iter().any(|e| matches!(e, Event::InboxChanged(_))));
}

#[test]
fn import_live_file_is_noop() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    {
        let guard = lock(host.service().unwrap());
        note(guard.store().unwrap(), "n1", 5);
    }
    let live = dir.path().join("orasenda.db");
    let before = live_counts(&host);
    let report = run_import(&host, dir.path(), &live).expect("imports");
    assert_eq!((report.added, report.updated), Default::default());
    assert_eq!(live_counts(&host), before);
    assert!(leftovers(dir.path()).is_empty());
}

#[test]
fn import_wal_source_with_commit_still_in_wal() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let (_keep, path) = source(|_| {});
    let conn = RawDb::open(&path);
    conn.exec(
        "PRAGMA wal_autocheckpoint = 0;
         INSERT INTO inbox_note (id, text, kind, created_at) VALUES ('w1', 'in the wal', 'internal', 5);",
    );
    assert!(
        std::fs::metadata(format!("{}-wal", path.display()))
            .unwrap()
            .len()
            > 0
    );
    let report = run_import(&host, dir.path(), &path).expect("imports");
    assert_eq!(report.added.notes, 1);
    assert_eq!(live_counts(&host).notes, 1);
    assert!(leftovers(dir.path()).is_empty());
    drop(conn);
}
