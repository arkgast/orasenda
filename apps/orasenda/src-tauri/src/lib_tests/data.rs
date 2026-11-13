//! The data commands: who may call them, and what they do to the data dir and the host.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use orasenda_core::NotificationStatus;
use orasenda_service::api::{
    BackupFrequency, BackupKind, BackupPolicy, DataErrorKind, StartRequest, StoreStatus,
};
use orasenda_service::data::{self, backups};
use orasenda_service::session::test_support::{Event, TestHost, fakes};
use orasenda_service::session::{Action, SessionService, run_action_on};
use orasenda_store::{OpenError, Store};

use super::*;
use crate::data_tasks;

const NOW: u64 = 1_794_009_600_000;
const DAY: u64 = 86_400_000;

struct TempDir(PathBuf);

impl TempDir {
    fn new() -> TempDir {
        let path = std::env::temp_dir().join(format!("orasenda-g5-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(&path).unwrap();
        TempDir(path)
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn open(dir: &Path) -> Store {
    orasenda_service::session::open_store_at(dir, "device-g5").unwrap()
}

fn host_on(store: Result<Store, OpenError>, dir: &Path) -> TestHost {
    let f = fakes(NotificationStatus::NotDetermined, false);
    let host = TestHost::with(
        SessionService::new(store, f.platform, NOW),
        f.log,
        f.notifier,
    );
    host.set_data_dir(dir.to_path_buf());
    host.set_now(NOW);
    host
}

fn keep(host: &TestHost, keep: u32) {
    data::run_backups_set_policy(
        host,
        &BackupPolicy {
            frequency: BackupFrequency::Monthly,
            keep,
        },
    )
    .unwrap();
}

/// A host with a working store, and its data dir.
fn live() -> (TempDir, TestHost) {
    let dir = TempDir::new();
    let host = host_on(Ok(open(&dir.0)), &dir.0);
    (dir, host)
}

/// A host whose store did not open, with one manual backup already in the folder.
fn without_store() -> (TempDir, TestHost, String) {
    let dir = TempDir::new();
    let file = {
        let store = open(&dir.0);
        let entry = backups::create(&store, &dir.0, BackupKind::Manual, NOW - DAY).unwrap();
        entry.file
    };
    std::fs::remove_file(dir.0.join("orasenda.db")).unwrap();
    let host = host_on(Err(OpenError::Io("no".into())), &dir.0);
    (dir, host, file)
}

fn kinds(dir: &Path) -> Vec<BackupKind> {
    backups::list(dir).iter().map(|e| e.kind).collect()
}

fn restarts(host: &TestHost) -> usize {
    host.log().count(|e| matches!(e, Event::Restarted))
}

fn backups_changed(host: &TestHost) -> usize {
    host.log().count(|e| matches!(e, Event::BackupsChanged(_)))
}

#[test]
fn data_commands_in_main_capability_only() {
    let data = [
        "allow-data-overview",
        "allow-data-show-folder",
        "allow-data-delete-all",
        "allow-backups-create",
        "allow-backups-delete",
        "allow-backups-restore",
        "allow-backups-set-policy",
    ];
    for file in [
        "main.json",
        "focus.json",
        "floater.json",
        "capture.json",
        "dev.json",
        "overlay.json",
    ] {
        let (_, granted) = capability(file);
        for permission in data {
            assert_eq!(
                granted.iter().any(|g| g == permission),
                file == "main.json",
                "{file}: {permission}"
            );
        }
    }
    for command in data.map(|p| p.trim_start_matches("allow-").replace('-', "_")) {
        assert!(COMMANDS.contains(&command.as_str()), "{command} not listed");
    }
}

#[test]
fn overview_counts_null_when_unavailable() {
    let (dir, host, file) = without_store();
    let overview = data::run_overview(&host);
    assert_eq!(overview.counts, None);
    assert_eq!(overview.store, StoreStatus::Unavailable);
    assert_eq!(overview.backups.len(), 1);
    assert_eq!(overview.backups[0].file, file);
    assert_eq!(overview.total_bytes, overview.backups[0].bytes);
    assert_eq!(overview.folder, dir.0.to_string_lossy());
    let (_dir, live) = live();
    let overview = data::run_overview(&live);
    assert!(overview.counts.is_some());
    assert_eq!(overview.store, StoreStatus::Ok);
}

#[test]
fn delete_all_busy_refused() {
    let (dir, host) = live();
    run_action_on(&host, Action::Start(StartRequest { quick: false })).unwrap();
    assert!(data::busy(&host));
    host.log().take();
    let error = data::run_data_delete_all(&host).unwrap_err();
    assert_eq!(error.kind, DataErrorKind::Busy);
    assert!(!dir.0.join("orasenda.delete").exists());
    assert_eq!(restarts(&host), 0);
    run_action_on(&host, Action::Pause).unwrap();
    assert_eq!(
        data::run_data_delete_all(&host).unwrap_err().kind,
        DataErrorKind::Busy,
        "a paused session is still a session"
    );
}

#[test]
fn delete_all_stages_and_restarts() {
    let (dir, host) = live();
    assert!(!data::busy(&host));
    data::run_data_delete_all(&host).unwrap();
    assert!(dir.0.join("orasenda.delete").is_file());
    assert_eq!(restarts(&host), 1);
    // Without a store it works too.
    let (dir, host, _) = without_store();
    data::run_data_delete_all(&host).unwrap();
    assert!(dir.0.join("orasenda.delete").is_file());
    assert_eq!(restarts(&host), 1);
}

#[test]
fn restore_newer_refused() {
    let (dir, host) = live();
    let entry = data::run_backups_create(&host).unwrap();
    let path = dir.0.join("Backups").join(&entry.file);
    let mut bytes = std::fs::read(&path).unwrap();
    bytes[60..64].copy_from_slice(&99_u32.to_be_bytes());
    std::fs::write(&path, bytes).unwrap();
    host.log().take();
    let error = data::run_backups_restore(&host, &entry.file).unwrap_err();
    assert_eq!(error.kind, DataErrorKind::Newer);
    assert!(!dir.0.join("orasenda.restore.db").exists());
    assert_eq!(kinds(&dir.0), [BackupKind::Manual]);
    assert_eq!(restarts(&host), 0);
}

#[test]
fn restore_order_stage_backup_restart() {
    let (dir, host) = live();
    keep(&host, 1);
    let chosen = data::run_backups_create(&host).unwrap();
    host.log().take();
    data::run_backups_restore(&host, &chosen.file).unwrap();
    // With keep 1 the safety backup pruned the chosen file: only a staging made first still
    // holds its data.
    let staged = dir.0.join("orasenda.restore.db");
    assert!(orasenda_store::portability::probe(&staged).is_ok());
    assert_eq!(kinds(&dir.0), [BackupKind::BeforeRestore]);
    assert_eq!(host.log().take().last(), Some(&Event::Restarted));
    // Busy comes before everything.
    run_action_on(&host, Action::Start(StartRequest { quick: false })).unwrap();
    assert_eq!(
        data::run_backups_restore(&host, "x").unwrap_err().kind,
        DataErrorKind::Busy
    );
}

#[test]
fn restore_without_store_skips_backup() {
    let (dir, host, file) = without_store();
    data::run_backups_restore(&host, &file).unwrap();
    assert!(dir.0.join("orasenda.restore.db").is_file());
    assert_eq!(kinds(&dir.0), [BackupKind::Manual]);
    assert_eq!(restarts(&host), 1);
    // The file operations that need no store work as well.
    data::run_backups_delete(&host, &file).unwrap();
    assert!(kinds(&dir.0).is_empty());
}

#[test]
fn create_unavailable_without_store() {
    let (dir, host, _) = without_store();
    host.log().take();
    let error = data::run_backups_create(&host).unwrap_err();
    assert_eq!(error.kind, DataErrorKind::Unavailable);
    let error = data::run_backups_set_policy(&host, &BackupPolicy::default()).unwrap_err();
    assert_eq!(error.kind, DataErrorKind::Unavailable);
    assert_eq!(kinds(&dir.0), [BackupKind::Manual]);
    assert_eq!(backups_changed(&host), 0);
}

#[test]
fn auto_check_single_flight() {
    let (_dir, host) = live();
    let flag = AtomicBool::new(false);
    let mut inner_ran = true;
    assert!(data_tasks::single_flight(&flag, || {
        inner_ran = data_tasks::check(&host, &flag);
    }));
    assert!(!inner_ran, "a second call returns at once");
    assert_eq!(backups_changed(&host), 0, "the second call did nothing");
    assert!(!flag.load(Ordering::SeqCst), "the guard is released");
    assert!(data_tasks::check(&host, &flag));
    assert_eq!(backups_changed(&host), 1);
    // A panic in the work still releases the guard.
    let caught = std::panic::catch_unwind(|| {
        data_tasks::single_flight(&flag, || panic!("boom"));
    });
    assert!(caught.is_err());
    assert!(!flag.load(Ordering::SeqCst));
}

#[test]
fn auto_check_creates_only_when_due() {
    let (dir, host) = live();
    assert!(data::run_auto_check(&host));
    assert_eq!(kinds(&dir.0), [BackupKind::Auto]);
    assert_eq!(backups_changed(&host), 1);
    host.set_now(NOW + 29 * DAY);
    assert!(!data::run_auto_check(&host));
    assert_eq!(backups_changed(&host), 1);
    host.set_now(NOW + 30 * DAY);
    assert!(data::run_auto_check(&host));
    assert_eq!(kinds(&dir.0), [BackupKind::Auto, BackupKind::Auto]);
    assert_eq!(backups_changed(&host), 2);
    // Without a store it does nothing.
    let (_dir, host, _) = without_store();
    assert!(!data::run_auto_check(&host));
    assert_eq!(backups_changed(&host), 0);
}
