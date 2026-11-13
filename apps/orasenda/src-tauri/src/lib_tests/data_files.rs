//! Export and import through a fake file panel: no panel opens, and no webview may ask for one.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use orasenda_core::NotificationStatus;
use orasenda_service::api::{DataError, DataErrorKind, ExportOutcome, ImportOutcome, StartRequest};
use orasenda_service::keyboard::KeyboardService;
use orasenda_service::keyboard::test_support::FakeRegistrar;
use orasenda_service::session::test_support::{Event, TestHost, fakes};
use orasenda_service::session::{Action, SessionService, run_action_on};
use orasenda_store::Store;

use super::*;
use crate::commands::{export_with, import_with};
use crate::file_picker::FilePicker;

const NOW: u64 = 1_794_009_600_000;

struct TempDir(PathBuf);

impl TempDir {
    fn new() -> TempDir {
        let path = std::env::temp_dir().join(format!("orasenda-g6-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(&path).unwrap();
        TempDir(path)
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Answers every panel with `answer` and remembers what it was asked.
struct FakePicker {
    answer: Result<Option<PathBuf>, DataError>,
    asked: AtomicUsize,
    name: Mutex<Option<String>>,
}

impl FakePicker {
    fn new(answer: Result<Option<PathBuf>, DataError>) -> FakePicker {
        FakePicker {
            answer,
            asked: AtomicUsize::new(0),
            name: Mutex::new(None),
        }
    }

    fn asked(&self) -> usize {
        self.asked.load(Ordering::SeqCst)
    }
}

impl FilePicker for FakePicker {
    fn save(&self, default_name: &str) -> Result<Option<PathBuf>, DataError> {
        self.asked.fetch_add(1, Ordering::SeqCst);
        *self.name.lock().unwrap() = Some(default_name.to_string());
        self.answer.clone()
    }

    fn open(&self) -> Result<Option<PathBuf>, DataError> {
        self.asked.fetch_add(1, Ordering::SeqCst);
        self.answer.clone()
    }
}

fn host_in(dir: &Path) -> TestHost {
    let f = fakes(NotificationStatus::NotDetermined, false);
    let store = orasenda_service::session::open_store_at(dir, "device-g6").unwrap();
    let host = TestHost::with(
        SessionService::new(Ok(store), f.platform, NOW),
        f.log,
        f.notifier,
    );
    host.set_data_dir(dir.to_path_buf());
    host.set_now(NOW);
    host
}

fn keyboard() -> (KeyboardService, std::sync::Arc<FakeRegistrar>) {
    let registrar = std::sync::Arc::new(FakeRegistrar::default());
    (KeyboardService::new(registrar.clone()), registrar)
}

/// A data file of another Orasenda, in its own dir.
fn other_file() -> (TempDir, PathBuf) {
    let dir = TempDir::new();
    let store = orasenda_service::session::open_store_at(&dir.0, "device-other").unwrap();
    store
        .write(NOW, |txn| {
            orasenda_store::inbox_notes::insert(
                txn,
                &orasenda_store::inbox_notes::NewNote {
                    id: "n1".into(),
                    text: "from the other Mac".into(),
                    kind: orasenda_store::inbox_notes::NoteKind::Internal,
                    created_at: NOW,
                },
            )
        })
        .unwrap();
    drop(store);
    let path = dir.0.join("orasenda.db");
    (dir, path)
}

fn start_session(host: &TestHost) {
    run_action_on(host, Action::Start(StartRequest { quick: false })).unwrap();
}

#[test]
fn no_dialog_permission_in_capabilities() {
    for file in [
        "main.json",
        "focus.json",
        "floater.json",
        "capture.json",
        "dev.json",
        "overlay.json",
    ] {
        let (_, granted) = capability(file);
        for permission in granted {
            assert!(
                !permission.starts_with("dialog:") && !permission.starts_with("fs:"),
                "{file} grants {permission}"
            );
        }
    }
    let (_, main) = capability("main.json");
    for command in ["allow-data-export", "allow-data-import"] {
        assert!(main.iter().any(|p| p == command), "main lacks {command}");
    }
}

#[test]
fn export_cancelled_writes_nothing() {
    let dir = TempDir::new();
    let host = host_in(&dir.0);
    let listing = |d: &Path| {
        let mut names: Vec<_> = std::fs::read_dir(d)
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        names.sort();
        names
    };
    let before = listing(&dir.0);
    let picker = FakePicker::new(Ok(None));
    let outcome = export_with(&host, &picker).unwrap();
    assert_eq!(outcome, ExportOutcome::Cancelled);
    assert_eq!(picker.asked(), 1);
    assert_eq!(
        picker.name.lock().unwrap().as_deref(),
        Some("Orasenda data 2026-11-07.db")
    );
    let after = listing(&dir.0);
    assert_eq!(before, after);
    assert!(
        after
            .iter()
            .all(|n| !n.to_string_lossy().ends_with(".partial"))
    );
}

#[test]
fn export_saved_snapshot_opens() {
    let dir = TempDir::new();
    let host = host_in(&dir.0);
    let dest = TempDir::new();
    let target = dest.0.join("Orasenda data 2026-11-07.db");
    let picker = FakePicker::new(Ok(Some(target.clone())));
    let outcome = export_with(&host, &picker).unwrap();
    assert_eq!(
        outcome,
        ExportOutcome::Saved {
            file: "Orasenda data 2026-11-07.db".into()
        }
    );
    let copy = Store::open(&target, "check").unwrap();
    assert!(copy.read(orasenda_store::portability::counts).is_ok());
    assert!(!dest.0.join("Orasenda data 2026-11-07.db.partial").exists());
}

#[test]
fn export_works_while_a_session_runs_and_refuses_the_live_file() {
    let dir = TempDir::new();
    let host = host_in(&dir.0);
    start_session(&host);
    let dest = TempDir::new();
    let target = dest.0.join("during.db");
    let saved = export_with(&host, &FakePicker::new(Ok(Some(target.clone())))).unwrap();
    assert!(matches!(saved, ExportOutcome::Saved { .. }));
    assert!(target.exists());
    let live = FakePicker::new(Ok(Some(dir.0.join("orasenda.db"))));
    let error = export_with(&host, &live).unwrap_err();
    assert_eq!(error.kind, DataErrorKind::Write);
}

#[test]
fn import_busy_before_panel() {
    let dir = TempDir::new();
    let host = host_in(&dir.0);
    start_session(&host);
    let (_other, file) = other_file();
    let picker = FakePicker::new(Ok(Some(file)));
    let (kb, registrar) = keyboard();
    let error = import_with(&host, &kb, &picker).unwrap_err();
    assert_eq!(error.kind, DataErrorKind::Busy);
    assert_eq!(picker.asked(), 0);
    assert!(registrar.calls().is_empty());
}

#[test]
fn import_without_a_store_is_unavailable_before_the_panel() {
    let dir = TempDir::new();
    let f = fakes(NotificationStatus::NotDetermined, false);
    let broken = orasenda_store::OpenError::Io("no store".into());
    let host = TestHost::with(
        SessionService::new(Err(broken), f.platform, NOW),
        f.log,
        f.notifier,
    );
    host.set_data_dir(dir.0.clone());
    host.set_now(NOW);
    let (_other, file) = other_file();
    let picker = FakePicker::new(Ok(Some(file)));
    let (kb, _registrar) = keyboard();
    let error = import_with(&host, &kb, &picker).unwrap_err();
    assert_eq!(error.kind, DataErrorKind::Unavailable);
    assert_eq!(picker.asked(), 0);
}

#[test]
fn import_cancelled_noop() {
    let dir = TempDir::new();
    let host = host_in(&dir.0);
    host.log().take();
    let picker = FakePicker::new(Ok(None));
    let (kb, registrar) = keyboard();
    let outcome = import_with(&host, &kb, &picker).unwrap();
    assert_eq!(outcome, ImportOutcome::Cancelled);
    assert_eq!(picker.asked(), 1);
    assert!(registrar.calls().is_empty());
    assert!(host.log().take().is_empty());
    assert!(!dir.0.join("Backups").exists());
}

#[test]
fn import_imported_returns_report() {
    let dir = TempDir::new();
    let host = host_in(&dir.0);
    let (_other, file) = other_file();
    host.log().take();
    let (kb, _registrar) = keyboard();
    let outcome = import_with(&host, &kb, &FakePicker::new(Ok(Some(file)))).unwrap();
    let ImportOutcome::Imported { report } = outcome else {
        panic!("expected an import, got {outcome:?}");
    };
    assert_eq!(report.added.notes, 1);
    assert!(
        host.log()
            .take()
            .iter()
            .any(|e| matches!(e, Event::KeyboardChanged(_)))
    );
}

#[test]
fn import_registers_shortcuts() {
    let dir = TempDir::new();
    let host = host_in(&dir.0);
    let (_other, file) = other_file();
    let (kb, registrar) = keyboard();
    import_with(&host, &kb, &FakePicker::new(Ok(Some(file)))).unwrap();
    assert!(
        !registrar.calls().is_empty(),
        "shortcuts were not registered"
    );
}

#[test]
fn import_failure_does_not_register_shortcuts() {
    let dir = TempDir::new();
    let host = host_in(&dir.0);
    let junk = dir.0.join("junk.db");
    std::fs::write(&junk, b"not sqlite at all, just text").unwrap();
    let (kb, registrar) = keyboard();
    let error = import_with(&host, &kb, &FakePicker::new(Ok(Some(junk)))).unwrap_err();
    assert_eq!(error.kind, DataErrorKind::NotOrasenda);
    assert!(registrar.calls().is_empty());
}

#[test]
fn a_panel_that_fails_is_an_error_not_a_cancel() {
    let dir = TempDir::new();
    let host = host_in(&dir.0);
    let broken = || {
        FakePicker::new(Err(DataError::new(
            DataErrorKind::Unavailable,
            "the file panel did not answer",
        )))
    };
    assert_eq!(
        export_with(&host, &broken()).unwrap_err().kind,
        DataErrorKind::Unavailable
    );
    let (kb, _) = keyboard();
    assert_eq!(
        import_with(&host, &kb, &broken()).unwrap_err().kind,
        DataErrorKind::Unavailable
    );
}
