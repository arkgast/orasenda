use crate::db::{Backing, check_journal_mode};
use crate::test_support::{TempDir, count};
use crate::*;
use orasenda_core::HlcStamp;
use rusqlite::Connection;
use std::path::Path;
use std::sync::Arc;

const DEVICE: &str = "device-a";

fn raw(path: &Path) -> Connection {
    Connection::open(path).expect("raw connection opens")
}

fn meta(conn: &Connection, key: &str) -> Option<String> {
    get_meta(conn, key).expect("meta query runs")
}

fn columns(conn: &Connection, table: &str) -> Vec<String> {
    let mut stmt = conn
        .prepare(&format!(
            "SELECT name FROM pragma_table_info('{table}') ORDER BY cid"
        ))
        .expect("table_info prepares");
    stmt.query_map([], |row| row.get(0))
        .expect("table_info runs")
        .collect::<Result<_, _>>()
        .expect("column names read")
}

#[test]
fn journal_mode_other_than_wal_is_refused_for_a_file() {
    assert_eq!(check_journal_mode(Backing::File, "wal"), Ok(()));
    assert_eq!(check_journal_mode(Backing::Memory, "memory"), Ok(()));
    assert_eq!(
        check_journal_mode(Backing::File, "delete"),
        Err(OpenError::Sqlite(
            "journal_mode is delete, expected wal".into()
        ))
    );
    assert_eq!(
        check_journal_mode(Backing::Memory, "delete"),
        Err(OpenError::Sqlite(
            "journal_mode is delete, expected memory".into()
        ))
    );
}

#[test]
fn store_is_send_and_sync() {
    fn assert_send_sync<T: Send + Sync>() {}
    assert_send_sync::<Store>();
    assert_send_sync::<Arc<Store>>();
}

#[test]
fn fresh_file_reaches_v2_without_review_marker() {
    let dir = TempDir::new("fresh");
    let store = Store::open(&dir.db(), DEVICE).expect("opens");
    assert_eq!(store.device_id(), DEVICE);
    drop(store);

    let conn = raw(&dir.db());
    let version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("user_version");
    assert_eq!(version, SCHEMA_VERSION);
    assert_eq!(version, 2);
    assert_eq!(meta(&conn, "notify_review"), None);
    let mode: String = conn
        .pragma_query_value(None, "journal_mode", |row| row.get(0))
        .expect("journal_mode");
    assert_eq!(mode, "wal");
    assert_eq!(meta(&conn, "device_id").as_deref(), Some(DEVICE));
    let hlc_last: HlcStamp = meta(&conn, "hlc_last")
        .expect("hlc_last is written")
        .parse()
        .expect("hlc_last is a stamp");
    assert_eq!(hlc_last.device_id, DEVICE);
    assert_eq!(
        meta(&conn, "schema_version"),
        None,
        "ADR-012: user_version only"
    );

    assert_eq!(columns(&conn, "meta"), ["key", "value"]);
    assert_eq!(
        columns(&conn, "change_log"),
        [
            "seq",
            "hlc",
            "device_id",
            "entity",
            "entity_id",
            "field",
            "value",
            "synced_at"
        ]
    );
    assert_eq!(columns(&conn, "setting"), ["key", "value", "updated_at"]);
    assert_eq!(
        columns(&conn, "focus_session"),
        [
            "id",
            "created_at",
            "updated_at",
            "deleted_at",
            "preset",
            "phase",
            "planned_ms",
            "started_at",
            "ended_at",
            "paused_total_ms",
            "focused_ms",
            "end_reason",
            "extensions",
            "intent"
        ]
    );
    assert_eq!(
        columns(&conn, "active_session"),
        ["singleton", "snapshot", "updated_at"]
    );
    assert_eq!(
        count(
            &conn,
            "SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        ),
        5
    );
}

#[test]
fn reopen_is_idempotent_and_keeps_device_id() {
    let dir = TempDir::new("reopen");
    let first = Store::open(&dir.db(), DEVICE).expect("opens");
    first
        .write(1_000, |txn| settings::set(txn, "k", &1))
        .expect("writes");
    drop(first);

    let second = Store::open(&dir.db(), "device-b").expect("reopens");
    assert_eq!(second.device_id(), DEVICE);
    let value: Option<i32> = second.read(|txn| settings::get(txn, "k")).expect("reads");
    assert_eq!(value, Some(1));
    drop(second);

    let third = Store::open(&dir.db(), "device-c").expect("reopens again");
    assert_eq!(third.device_id(), DEVICE);
    drop(third);
    let conn = raw(&dir.db());
    let version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("user_version");
    assert_eq!(version, SCHEMA_VERSION);
    assert_eq!(count(&conn, "SELECT count(*) FROM meta"), 2);
}

fn v1_file(dir: &TempDir) {
    let conn = raw(&dir.db());
    conn.execute_batch(include_str!("../migrations/0001_init.sql"))
        .expect("0001 applies");
    conn.pragma_update(None, "user_version", 1).expect("v1");
    conn.execute(
        "INSERT INTO meta (key, value) VALUES ('device_id', 'device-a')",
        [],
    )
    .expect("device_id");
}

fn user_version(path: &Path) -> u32 {
    raw(path)
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("user_version")
}

#[test]
fn v1_file_with_device_id_gets_review_marker() {
    let dir = TempDir::new("v1marker");
    v1_file(&dir);
    drop(Store::open(&dir.db(), "other").expect("opens"));
    assert_eq!(user_version(&dir.db()), 2);
    let conn = raw(&dir.db());
    assert_eq!(meta(&conn, "notify_review").as_deref(), Some("pending"));
    assert_eq!(meta(&conn, "device_id").as_deref(), Some("device-a"));
}

#[test]
fn meta_get_and_remove_write_no_change_log() {
    let dir = TempDir::new("metalog");
    v1_file(&dir);
    let store = Store::open(&dir.db(), "other").expect("opens");
    let got = store
        .read(|txn| meta::get(txn, "notify_review"))
        .expect("reads");
    assert_eq!(got.as_deref(), Some("pending"));
    store
        .write(1_000, |txn| meta::remove(txn, "notify_review"))
        .expect("removes");
    store
        .write(2_000, |txn| meta::remove(txn, "notify_review"))
        .expect("removing an absent key is fine");
    let got = store
        .read(|txn| meta::get(txn, "notify_review"))
        .expect("reads");
    assert_eq!(got, None);
    drop(store);
    assert_eq!(count(&raw(&dir.db()), "SELECT count(*) FROM change_log"), 0);
}

#[test]
fn v2_reopen_after_review_keeps_no_marker() {
    let dir = TempDir::new("v2reopen");
    v1_file(&dir);
    let store = Store::open(&dir.db(), "other").expect("opens");
    store
        .write(1_000, |txn| meta::remove(txn, "notify_review"))
        .expect("removes");
    drop(store);
    drop(Store::open(&dir.db(), "other").expect("reopens"));
    assert_eq!(user_version(&dir.db()), 2);
    assert_eq!(meta(&raw(&dir.db()), "notify_review"), None);
}

#[test]
fn newer_user_version_is_refused_and_untouched() {
    let dir = TempDir::new("newer");
    let newer = SCHEMA_VERSION + 1;
    {
        let conn = raw(&dir.db());
        conn.execute_batch("CREATE TABLE future (x INTEGER)")
            .expect("creates");
        conn.pragma_update(None, "user_version", newer)
            .expect("sets user_version");
    }
    let before = std::fs::read(dir.db()).expect("reads file");

    let result = Store::open(&dir.db(), DEVICE);
    assert_eq!(
        result.err(),
        Some(OpenError::Newer {
            found: newer,
            supported: SCHEMA_VERSION
        })
    );

    assert_eq!(std::fs::read(dir.db()).expect("reads file"), before);
    let entries: Vec<_> = std::fs::read_dir(dir.path())
        .expect("lists dir")
        .map(|entry| entry.expect("entry").file_name())
        .collect();
    assert_eq!(entries, [std::ffi::OsString::from("orasenda.sqlite")]);
}

#[test]
fn open_without_parent_dir_fails_without_creating_it() {
    let dir = TempDir::new("noparent");
    let missing = dir.path().join("missing");
    let result = Store::open(&missing.join("orasenda.sqlite"), DEVICE);
    assert!(
        matches!(result, Err(OpenError::Io(_) | OpenError::Sqlite(_))),
        "{:?}",
        result.err()
    );
    assert!(!missing.exists());
}

#[test]
fn failed_closure_rolls_back_previous_state_intact() {
    let store = Store::open_in_memory(DEVICE).expect("opens");
    store
        .write(1_000, |txn| settings::set(txn, "k", &1))
        .expect("writes");
    let hlc_before = store
        .read(|txn| Ok(get_meta(txn.conn(), "hlc_last")?))
        .expect("reads");

    let result: Result<(), StoreError> = store.write(2_000, |txn| {
        settings::set(txn, "k", &2)?;
        active_session::put(txn, &"live")?;
        Err(StoreError::Json("refused by the caller".into()))
    });
    assert_eq!(
        result,
        Err(StoreError::Json("refused by the caller".into()))
    );

    store
        .read(|txn| {
            assert_eq!(settings::get::<i32>(txn, "k")?, Some(1));
            assert_eq!(active_session::get::<String>(txn)?, None);
            assert_eq!(count(txn.conn(), "SELECT count(*) FROM change_log"), 1);
            assert_eq!(get_meta(txn.conn(), "hlc_last")?, hlc_before);
            Ok(())
        })
        .expect("reads");

    // The rolled-back stamps were never handed out: the next one follows the first write's.
    store
        .write(1_000, |txn| settings::set(txn, "k", &3))
        .expect("writes");
    let stamps: Vec<String> = store
        .read(|txn| {
            let mut stmt = txn
                .conn()
                .prepare("SELECT hlc FROM change_log ORDER BY seq")?;
            let rows = stmt.query_map([], |row| row.get(0))?;
            Ok(rows.collect::<Result<_, _>>()?)
        })
        .expect("reads");
    assert_eq!(
        stamps,
        [
            format!("0000000001000-00000-{DEVICE}"),
            format!("0000000001000-00001-{DEVICE}")
        ]
    );
}

#[test]
fn dropped_connection_without_commit_leaves_previous_state() {
    let dir = TempDir::new("crash");
    let survivor = Store::open(&dir.db(), DEVICE).expect("opens");
    survivor
        .write(1_000, |txn| settings::set(txn, "k", &1))
        .expect("writes");
    let hlc_before = meta(&raw(&dir.db()), "hlc_last");

    let crashing = Store::open(&dir.db(), DEVICE).expect("opens a second store");
    let crashed = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        crashing.write::<()>(2_000, |txn| {
            settings::set(txn, "k", &2)?;
            active_session::put(txn, &"live")?;
            panic!("simulated crash before commit");
        })
    }));
    assert!(crashed.is_err());

    // The poisoned store recovers its mutex and sees the old state.
    let seen: Option<i32> = crashing.read(|txn| settings::get(txn, "k")).expect("reads");
    assert_eq!(seen, Some(1));
    drop(crashing);

    survivor
        .read(|txn| {
            assert_eq!(settings::get::<i32>(txn, "k")?, Some(1));
            assert_eq!(active_session::get::<String>(txn)?, None);
            assert_eq!(count(txn.conn(), "SELECT count(*) FROM change_log"), 1);
            Ok(())
        })
        .expect("reads");
    drop(survivor);
    assert_eq!(meta(&raw(&dir.db()), "hlc_last"), hlc_before);
}

#[test]
fn hlc_last_persists_across_reopen() {
    let dir = TempDir::new("hlc");
    let store = Store::open(&dir.db(), DEVICE).expect("opens");
    store
        .write(5_000, |txn| {
            settings::set(txn, "a", &1)?;
            settings::set(txn, "b", &2)
        })
        .expect("writes");
    drop(store);
    assert_eq!(
        meta(&raw(&dir.db()), "hlc_last").as_deref(),
        Some(format!("0000000005000-00001-{DEVICE}").as_str())
    );

    // A wall clock that went backwards still continues after the saved stamp.
    let store = Store::open(&dir.db(), DEVICE).expect("reopens");
    store
        .write(1_000, |txn| settings::set(txn, "a", &3))
        .expect("writes");
    drop(store);
    let conn = raw(&dir.db());
    let latest: String = conn
        .query_row(
            "SELECT hlc FROM change_log ORDER BY seq DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .expect("reads");
    assert_eq!(latest, format!("0000000005000-00002-{DEVICE}"));
    assert_eq!(meta(&conn, "hlc_last"), Some(latest));
}

#[test]
fn hlc_last_device_id_must_match_meta_device_id() {
    let dir = TempDir::new("hlcdevice");
    drop(Store::open(&dir.db(), DEVICE).expect("opens"));
    raw(&dir.db())
        .execute(
            "UPDATE meta SET value = '0000000005000-00000-someone-else' WHERE key = 'hlc_last'",
            [],
        )
        .expect("tampers");

    let result = Store::open(&dir.db(), DEVICE);
    match result {
        Err(OpenError::Sqlite(message)) => {
            assert!(message.contains("hlc_last"), "{message}");
            assert!(message.contains("someone-else"), "{message}");
        }
        other => panic!("expected OpenError::Sqlite, got {:?}", other.err()),
    }
}

#[test]
fn open_in_memory_works_for_app_tests() {
    let store = Store::open_in_memory(DEVICE).expect("opens");
    assert_eq!(store.device_id(), DEVICE);
    store
        .write(1_000, |txn| {
            settings::set(txn, "notify.session_end", &true)?;
            active_session::put(txn, &serde_json::json!({ "state": "running" }))
        })
        .expect("writes");
    let (flag, live) = store
        .read(|txn| {
            Ok((
                settings::get::<bool>(txn, "notify.session_end")?,
                active_session::get::<serde_json::Value>(txn)?,
            ))
        })
        .expect("reads");
    assert_eq!(flag, Some(true));
    assert_eq!(live, Some(serde_json::json!({ "state": "running" })));
    let version: u32 = store
        .read(|txn| {
            Ok(txn
                .conn()
                .pragma_query_value(None, "user_version", |row| row.get(0))?)
        })
        .expect("reads");
    assert_eq!(version, SCHEMA_VERSION);
}
