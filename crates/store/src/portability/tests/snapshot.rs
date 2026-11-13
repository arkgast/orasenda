use super::{DEVICE, exec, rows};
use crate::test_support::TempDir;
use crate::{SCHEMA_VERSION, Store};
use rusqlite::Connection;

const TABLES: [&str; 8] = [
    "meta",
    "change_log",
    "setting",
    "focus_session",
    "active_session",
    "preset",
    "inbox_note",
    "window_frame",
];

fn seeded(dir: &TempDir) -> Store {
    let store = Store::open(&dir.db(), DEVICE).expect("opens");
    exec(
        &store,
        "INSERT INTO setting (key, value, updated_at) VALUES ('theme', '\"dark\"', 5);
         INSERT INTO inbox_note (id, text, kind, created_at) VALUES ('n1', 'hello', 'internal', 7);
         INSERT INTO change_log (hlc, device_id, entity, entity_id, field, value)
           VALUES ('h', 'd', 'setting', 'theme', 'value', '1');",
    );
    store
}

#[test]
fn snapshot_round_trip_equal_rows() {
    let dir = TempDir::new("snap-round-trip");
    let store = seeded(&dir);
    let dest = dir.path().join("copy.db");
    store.snapshot_to(&dest).expect("snapshots");
    assert!(!dir.path().join("copy.db.partial").exists());

    let copy = Store::open(&dest, "other-device").expect("copy opens");
    assert_eq!(copy.device_id(), DEVICE);
    let live = Connection::open(dir.db()).expect("live");
    let snap = Connection::open(&dest).expect("snap");
    let version: u32 = snap
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .expect("version");
    assert_eq!(version, SCHEMA_VERSION);
    for table in TABLES {
        assert_eq!(rows(&snap, table), rows(&live, table), "table {table}");
    }
    assert_eq!(rows(&snap, "inbox_note").len(), 1);
}

#[test]
fn snapshot_replaces_existing_dest() {
    let dir = TempDir::new("snap-replace");
    let store = seeded(&dir);
    let dest = dir.path().join("copy.db");
    std::fs::write(&dest, "old contents").expect("writes");
    store.snapshot_to(&dest).expect("snapshots");
    let snap = Connection::open(&dest).expect("snap");
    assert_eq!(rows(&snap, "setting").len(), 1);
}

#[test]
fn snapshot_failure_leaves_no_partial() {
    let dir = TempDir::new("snap-fail");
    let store = seeded(&dir);
    // A non-empty directory at dest: VACUUM INTO works, the rename over it cannot.
    let dest = dir.path().join("taken");
    std::fs::create_dir(&dest).expect("dir");
    std::fs::write(dest.join("keep"), "x").expect("file");
    assert!(store.snapshot_to(&dest).is_err());
    assert!(!dir.path().join("taken.partial").exists());
    assert!(dest.join("keep").exists());

    // A missing parent folder: VACUUM INTO itself fails.
    let nowhere = dir.path().join("missing").join("copy.db");
    assert!(store.snapshot_to(&nowhere).is_err());
    assert!(!dir.path().join("missing").exists());
}
