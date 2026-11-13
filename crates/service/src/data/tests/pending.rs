use orasenda_store::active_session;

use super::super::backups::{create, folder};
use super::super::pending::{PendingOutcome, apply_pending, stage_delete, stage_restore};
use super::{T0, TempDir, get_meta, open, set_meta};
use crate::api::{BackupKind, DataErrorKind};

fn put_session(store: &orasenda_store::Store) {
    store
        .write(1, |txn| {
            active_session::put(txn, &serde_json::json!({ "live": true }))
        })
        .unwrap();
}

fn has_session(store: &orasenda_store::Store) -> bool {
    store
        .read(active_session::get::<serde_json::Value>)
        .unwrap()
        .is_some()
}

/// A dir with a live database holding marker "two" and a backup holding "one" and a session.
fn restorable() -> (TempDir, String) {
    let dir = TempDir::new();
    let store = open(dir.path());
    set_meta(&store, "marker", "one");
    put_session(&store);
    let made = create(&store, dir.path(), BackupKind::Manual, T0).unwrap();
    set_meta(&store, "marker", "two");
    (dir, made.file)
}

#[test]
fn pending_delete_wins() {
    let (dir, file) = restorable();
    stage_restore(dir.path(), &file).unwrap();
    stage_delete(dir.path()).unwrap();
    std::fs::write(dir.path().join("orasenda.db-wal"), b"x").unwrap();
    std::fs::write(dir.path().join("orasenda.db-shm"), b"x").unwrap();
    assert_eq!(apply_pending(dir.path()), PendingOutcome::Deleted);
    for name in [
        "orasenda.db",
        "orasenda.db-wal",
        "orasenda.db-shm",
        "orasenda.restore.db",
        "orasenda.delete",
    ] {
        assert!(!dir.path().join(name).exists(), "{name}");
    }
    assert!(
        folder(dir.path()).join(&file).exists(),
        "backups are not touched"
    );
    assert_eq!(apply_pending(dir.path()), PendingOutcome::None);
    let fresh = open(dir.path());
    assert_eq!(get_meta(&fresh, "marker"), None);
}

#[test]
fn pending_restore_swaps_and_clears_active_session() {
    let (dir, file) = restorable();
    stage_restore(dir.path(), &file).unwrap();
    assert!(dir.path().join("orasenda.restore.db").is_file());
    assert!(!dir.path().join("orasenda.restore.db.partial").exists());
    let store = open(dir.path());
    assert_eq!(get_meta(&store, "marker").as_deref(), Some("one"));
    assert!(!has_session(&store), "no session resumes after a restore");
    assert!(!dir.path().join("orasenda.restore.db").exists());
}

#[test]
fn pending_restore_refuses_unknown_and_newer() {
    let (dir, file) = restorable();
    assert_eq!(
        stage_restore(dir.path(), "../x.db").unwrap_err().kind,
        DataErrorKind::NotFound
    );
    super::set_user_version(
        &folder(dir.path()).join(&file),
        orasenda_store::SCHEMA_VERSION + 1,
    );
    assert_eq!(
        stage_restore(dir.path(), &file).unwrap_err().kind,
        DataErrorKind::Newer
    );
    assert!(!dir.path().join("orasenda.restore.db").exists());
}

#[test]
fn pending_removes_partials() {
    let dir = TempDir::new();
    let backups = folder(dir.path());
    std::fs::create_dir_all(&backups).unwrap();
    let junk = [
        dir.path().join("orasenda.restore.db.partial"),
        dir.path().join("import-0191.db"),
        backups.join("orasenda-20261103T091205Z-manual.db.partial"),
    ];
    let keepers = [
        dir.path().join("notes.partial.txt"),
        backups.join("mine.partial"),
    ];
    for path in junk.iter().chain(&keepers) {
        std::fs::write(path, b"x").unwrap();
    }
    assert_eq!(apply_pending(dir.path()), PendingOutcome::None);
    assert!(junk.iter().all(|p| !p.exists()));
    assert!(keepers.iter().all(|p| p.exists()));
}

#[test]
fn open_store_at_applies_pending() {
    let (dir, file) = restorable();
    stage_restore(dir.path(), &file).unwrap();
    let store = crate::session::open_store_at(dir.path(), "device-z").unwrap();
    assert_eq!(get_meta(&store, "marker").as_deref(), Some("one"));
    drop(store);
    stage_delete(dir.path()).unwrap();
    let store = crate::session::open_store_at(dir.path(), "device-z").unwrap();
    assert_eq!(get_meta(&store, "marker"), None);
    assert_eq!(store.device_id(), "device-z");
}
