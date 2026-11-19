//! Migration 0011: the `task` rebuild that relaxes the lane CHECK to admit custom column ids
//! (`c_` + 8 of 0-9a-z). Rows, ranks, `origin` and `change_log` survive; both indexes return.

use super::{TempDir, columns, count, raw};
use crate::migrate::MIGRATIONS;
use crate::*;
use rusqlite::Connection;
use std::path::Path;

fn v10_file(path: &Path) {
    let conn = raw(path);
    for (version, sql) in MIGRATIONS.iter().filter(|(version, _)| *version <= 10) {
        conn.execute_batch(sql).expect("migration applies");
        conn.pragma_update(None, "user_version", version)
            .expect("version");
    }
    conn.execute_batch(
        "INSERT INTO meta (key, value) VALUES ('device_id', 'device-a');
         INSERT INTO task (id, title, lane, rank, origin, created_at, updated_at)
           VALUES ('t1', 'Write', 'today', 'V', 'github:1', 1, 1);
         INSERT INTO task (id, title, lane, rank, created_at, updated_at, deleted_at)
           VALUES ('t2', 'Gone', 'done', 'a0', 2, 2, 3);
         INSERT INTO change_log (hlc, device_id, entity, entity_id, field, value)
           VALUES ('h', 'device-a', 'task', 't1', 'title', '\"Write\"');",
    )
    .expect("fills");
}

fn migrated(name: &str) -> (TempDir, Connection) {
    let dir = TempDir::new(name);
    v10_file(&dir.db());
    drop(Store::open(&dir.db(), "other").expect("opens and migrates"));
    let conn = raw(&dir.db());
    (dir, conn)
}

fn insert(conn: &Connection, lane: &str, origin: Option<&str>) -> rusqlite::Result<usize> {
    conn.execute(
        "INSERT INTO task (id, title, lane, rank, origin, created_at, updated_at)
         VALUES ('x', 'T', ?1, 'V', ?2, 1, 1)",
        rusqlite::params![lane, origin],
    )
}

#[test]
fn migration_0011_keeps_rows_and_indexes() {
    let (_dir, conn) = migrated("m11rows");
    let version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("user_version");
    assert_eq!(version, SCHEMA_VERSION);
    assert_eq!(count(&conn, "SELECT count(*) FROM task"), 2);
    assert_eq!(
        count(
            &conn,
            "SELECT count(*) FROM task WHERE id = 't1' AND lane = 'today' AND rank = 'V'
             AND origin = 'github:1' AND created_at = 1 AND updated_at = 1"
        ),
        1
    );
    assert_eq!(
        count(
            &conn,
            "SELECT count(*) FROM task WHERE id = 't2' AND lane = 'done' AND rank = 'a0'
             AND origin IS NULL AND deleted_at = 3"
        ),
        1
    );
    assert_eq!(count(&conn, "SELECT count(*) FROM change_log"), 1);
    assert_eq!(columns(&conn, "task").len(), 19);
    for name in ["task_live", "task_origin"] {
        assert_eq!(
            count(
                &conn,
                &format!(
                    "SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = '{name}' AND tbl_name = 'task'"
                )
            ),
            1,
            "{name} exists"
        );
    }
    let sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE name = 'task_origin'",
            [],
            |row| row.get(0),
        )
        .expect("index sql");
    assert!(sql.contains("WHERE origin IS NOT NULL"), "{sql}");
    assert_eq!(
        count(
            &conn,
            "SELECT count(*) FROM sqlite_master WHERE name = 'task_new'"
        ),
        0
    );
}

#[test]
fn migration_0011_lane_check() {
    let (_dir, conn) = migrated("m11lane");
    for lane in ["backlog", "today", "doing", "done", "c_ab12cd34"] {
        conn.execute("DELETE FROM task WHERE id = 'x'", [])
            .expect("clears x");
        insert(&conn, lane, None).unwrap_or_else(|e| panic!("{lane} accepted: {e}"));
    }
    for lane in ["c_AB", "custom", "c_ab12cd3!", "c_ab12cd345", "c_", ""] {
        conn.execute("DELETE FROM task WHERE id = 'x'", [])
            .expect("clears x");
        assert_check_refused(insert(&conn, lane, None), lane);
    }
}

#[test]
fn migration_0011_origin_check_kept() {
    let (_dir, conn) = migrated("m11origin");
    assert_check_refused(insert(&conn, "today", Some("x")), "origin x");
    conn.execute("DELETE FROM task WHERE id = 'x'", [])
        .expect("clears x");
    insert(&conn, "today", Some("github:2")).expect("valid origin accepted");
}

fn assert_check_refused<T: std::fmt::Debug>(res: rusqlite::Result<T>, what: &str) {
    match res {
        Err(rusqlite::Error::SqliteFailure(e, _)) => assert_eq!(
            e.extended_code,
            rusqlite::ffi::SQLITE_CONSTRAINT_CHECK,
            "{what} refused by CHECK"
        ),
        other => panic!("{what}: expected CHECK failure, got {other:?}"),
    }
}
