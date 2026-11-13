//! Migration 0006: the session intent is cleared, its change_log rows are gone, nothing new is
//! logged. The column stays.

use super::{TempDir, count, raw};
use crate::migrate::MIGRATIONS;
use crate::*;
use std::path::Path;

/// A v5 file with two sessions (one with an intent), an intent change_log row per session
/// that has one, and a change_log row for another field that must survive.
fn v5_file(path: &Path) {
    let conn = raw(path);
    for (version, sql) in MIGRATIONS.iter().filter(|(version, _)| *version <= 5) {
        conn.execute_batch(sql).expect("migration applies");
        conn.pragma_update(None, "user_version", version)
            .expect("version");
    }
    conn.execute(
        "INSERT INTO meta (key, value) VALUES ('device_id', 'device-a')",
        [],
    )
    .expect("device_id");
    for (id, intent) in [("s1", Some("Outline")), ("s2", None)] {
        conn.execute(
            "INSERT INTO focus_session (id, created_at, updated_at, preset, phase, planned_ms,
                started_at, ended_at, paused_total_ms, focused_ms, end_reason, intent)
             VALUES (?1, 1, 1, 'classic', 'focus', 1, 1, 2, 0, 1, 'completed', ?2)",
            rusqlite::params![id, intent],
        )
        .expect("session inserts");
    }
    for (field, value) in [("intent", "\"Outline\""), ("extensions", "0")] {
        conn.execute(
            "INSERT INTO change_log (hlc, device_id, entity, entity_id, field, value)
             VALUES ('h', 'device-a', 'focus_session', 's1', ?1, ?2)",
            rusqlite::params![field, value],
        )
        .expect("change_log inserts");
    }
}

fn migrated(name: &str) -> (TempDir, rusqlite::Connection) {
    let dir = TempDir::new(name);
    v5_file(&dir.db());
    drop(Store::open(&dir.db(), "other").expect("opens"));
    let conn = raw(&dir.db());
    (dir, conn)
}

#[test]
fn migration_0006_nulls_intent() {
    let (_dir, conn) = migrated("m6null");
    let sql = "SELECT count(*) FROM focus_session WHERE intent IS NOT NULL";
    assert_eq!(count(&conn, sql), 0);
    assert_eq!(count(&conn, "SELECT count(*) FROM focus_session"), 2);
}

#[test]
fn migration_0006_deletes_intent_change_log_rows() {
    let (_dir, conn) = migrated("m6log");
    let sql = "SELECT count(*) FROM change_log WHERE field = 'intent'";
    assert_eq!(count(&conn, sql), 0);
    let kept = "SELECT count(*) FROM change_log WHERE field = 'extensions'";
    assert_eq!(count(&conn, kept), 1, "other fields keep their rows");
}

#[test]
fn migration_0006_writes_no_change_log() {
    let (_dir, conn) = migrated("m6nolog");
    assert_eq!(count(&conn, "SELECT count(*) FROM change_log"), 1);
}
