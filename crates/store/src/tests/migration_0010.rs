//! Migration 0010: the `reflection` table on a filled v9 file, and the CHECKs and the UNIQUE
//! index that guard it.

use super::{TempDir, columns, count, raw};
use crate::migrate::MIGRATIONS;
use crate::*;
use rusqlite::Connection;
use std::path::Path;

fn v9_file(path: &Path) {
    let conn = raw(path);
    for (version, sql) in MIGRATIONS.iter().filter(|(version, _)| *version <= 9) {
        conn.execute_batch(sql).expect("migration applies");
        conn.pragma_update(None, "user_version", version)
            .expect("version");
    }
    conn.execute_batch(
        "INSERT INTO meta (key, value) VALUES ('device_id', 'device-a');
         INSERT INTO task (id, title, lane, rank, created_at, updated_at)
           VALUES ('t1', 'Write', 'today', 'V', 1, 1);
         INSERT INTO inbox_note (id, text, kind, created_at) VALUES ('n1', 'x', 'internal', 1);
         INSERT INTO change_log (hlc, device_id, entity, entity_id, field, value)
           VALUES ('h', 'device-a', 'task', 't1', 'title', '\"Write\"');",
    )
    .expect("fills");
}

fn migrated(name: &str) -> (TempDir, Connection) {
    let dir = TempDir::new(name);
    v9_file(&dir.db());
    drop(Store::open(&dir.db(), "other").expect("opens and migrates"));
    let conn = raw(&dir.db());
    (dir, conn)
}

const SHUTDOWN: &str = "INSERT INTO reflection (id, kind, period, created_at, updated_at)
    VALUES ('shutdown:2026-11-16', 'shutdown', '2026-11-16', 1, 1)";

#[test]
fn migration_0010_keeps_data() {
    let (_dir, conn) = migrated("m10rows");
    let version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("user_version");
    assert_eq!(version, SCHEMA_VERSION);
    assert_eq!(count(&conn, "SELECT count(*) FROM task"), 1);
    assert_eq!(count(&conn, "SELECT count(*) FROM inbox_note"), 1);
    assert_eq!(count(&conn, "SELECT count(*) FROM change_log"), 1);
    assert_eq!(count(&conn, "SELECT count(*) FROM reflection"), 0);
}

#[test]
fn fresh_schema_has_reflection_table() {
    let dir = TempDir::new("m10fresh");
    drop(Store::open(&dir.db(), "device-a").expect("opens"));
    let conn = raw(&dir.db());
    assert_eq!(
        columns(&conn, "reflection"),
        [
            "id",
            "kind",
            "period",
            "went_well",
            "to_improve",
            "outside_control",
            "improvement",
            "notes",
            "priorities",
            "completed_at",
            "created_at",
            "updated_at",
            "deleted_at"
        ]
    );
}

#[test]
fn check_refuses_week_fields_on_shutdown() {
    let (_dir, conn) = migrated("m10week");
    conn.execute_batch(SHUTDOWN).expect("a bare shutdown row");
    for set in ["improvement = 'x'", "notes = 'x'", "priorities = '[\"a\"]'"] {
        let refused = conn.execute(&format!("UPDATE reflection SET {set}"), []);
        assert!(refused.is_err(), "{set} must be refused on a shutdown row");
    }
}

#[test]
fn check_refuses_shutdown_fields_on_week() {
    let (_dir, conn) = migrated("m10shut");
    conn.execute_batch(
        "INSERT INTO reflection (id, kind, period, created_at, updated_at)
         VALUES ('week:2026-11-16', 'week', '2026-11-16', 1, 1)",
    )
    .expect("a bare week row");
    for set in ["went_well", "to_improve", "outside_control"] {
        let refused = conn.execute(&format!("UPDATE reflection SET {set} = 'x'"), []);
        assert!(refused.is_err(), "{set} must be refused on a week row");
    }
    conn.execute(
        "UPDATE reflection SET improvement = 'x', notes = 'y', priorities = '[\"a\",\"b\"]'",
        [],
    )
    .expect("week fields are accepted");
}

#[test]
fn check_refuses_bad_period() {
    let (_dir, conn) = migrated("m10period");
    for period in ["2026-11", "tomorrow", "2026-11-16x", "x2026-11-16"] {
        let refused = conn.execute(
            "INSERT INTO reflection (id, kind, period, created_at, updated_at)
             VALUES ('shutdown:' || ?1, 'shutdown', ?1, 1, 1)",
            [period],
        );
        assert!(refused.is_err(), "{period:?} must be refused");
    }
    let mismatch = conn.execute(
        "INSERT INTO reflection (id, kind, period, created_at, updated_at)
         VALUES ('week:2026-11-16', 'shutdown', '2026-11-16', 1, 1)",
        [],
    );
    assert!(mismatch.is_err(), "the id must follow kind and period");
}

#[test]
fn check_refuses_long_texts() {
    let (_dir, conn) = migrated("m10long");
    conn.execute_batch(SHUTDOWN).expect("row");
    let over = |n: usize| "x".repeat(n);
    for col in ["went_well", "to_improve", "outside_control"] {
        let sql = format!("UPDATE reflection SET {col} = ?1");
        assert!(conn.execute(&sql, [over(1001)]).is_err(), "{col} 1001");
        conn.execute(&sql, [over(1000)]).expect("1000 is accepted");
    }
    conn.execute(
        "INSERT INTO reflection (id, kind, period, created_at, updated_at)
         VALUES ('week:2026-11-16', 'week', '2026-11-16', 1, 1)",
        [],
    )
    .expect("week row");
    let week = "WHERE kind = 'week'";
    assert!(
        conn.execute(
            &format!("UPDATE reflection SET improvement = ?1 {week}"),
            [over(201)]
        )
        .is_err()
    );
    assert!(
        conn.execute(
            &format!("UPDATE reflection SET notes = ?1 {week}"),
            [over(2001)]
        )
        .is_err()
    );
    conn.execute(
        &format!("UPDATE reflection SET improvement = ?1, notes = ?2 {week}"),
        [over(200), over(2000)],
    )
    .expect("the limits themselves are accepted");
}

#[test]
fn check_refuses_invalid_priorities_json() {
    let (_dir, conn) = migrated("m10json");
    conn.execute_batch(
        "INSERT INTO reflection (id, kind, period, created_at, updated_at)
         VALUES ('week:2026-11-16', 'week', '2026-11-16', 1, 1)",
    )
    .expect("week row");
    for bad in ["not json", "{\"a\":1}", "\"a\"", "[\"a\""] {
        let refused = conn.execute("UPDATE reflection SET priorities = ?1", [bad]);
        assert!(refused.is_err(), "{bad:?} must be refused");
    }
}

#[test]
fn unique_kind_period() {
    let (_dir, conn) = migrated("m10unique");
    conn.execute_batch(SHUTDOWN).expect("first");
    assert!(conn.execute_batch(SHUTDOWN).is_err(), "same id twice");
    conn.execute_batch(
        "INSERT INTO reflection (id, kind, period, created_at, updated_at)
         VALUES ('week:2026-11-16', 'week', '2026-11-16', 1, 1)",
    )
    .expect("the same period under the other kind is a different row");
    assert_eq!(count(&conn, "SELECT count(*) FROM reflection"), 2);
    let cols: String = conn
        .query_row(
            "SELECT group_concat(name) FROM pragma_index_info('reflection_kind_period')",
            [],
            |r| r.get(0),
        )
        .expect("index columns");
    assert_eq!(cols, "kind,period");
    assert_eq!(
        count(
            &conn,
            "SELECT count(*) FROM pragma_index_list('reflection') WHERE \"unique\" = 1 AND origin = 'c'"
        ),
        1
    );
}
