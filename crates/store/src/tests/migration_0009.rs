//! Migration 0009: `task.origin` on a filled v8 file. Existing tasks read NULL, the CHECK refuses
//! a malformed origin, nothing is logged.

use super::{TempDir, columns, count, raw};
use crate::migrate::MIGRATIONS;
use crate::*;
use std::path::Path;

fn v8_file(path: &Path) {
    let conn = raw(path);
    for (version, sql) in MIGRATIONS.iter().filter(|(version, _)| *version <= 8) {
        conn.execute_batch(sql).expect("migration applies");
        conn.pragma_update(None, "user_version", version)
            .expect("version");
    }
    conn.execute_batch(
        "INSERT INTO meta (key, value) VALUES ('device_id', 'device-a');
         INSERT INTO task (id, title, lane, rank, created_at, updated_at)
           VALUES ('t1', 'Write', 'today', 'V', 1, 1);
         INSERT INTO task (id, title, lane, rank, created_at, updated_at, deleted_at)
           VALUES ('t2', 'Gone', 'backlog', 'V', 1, 1, 2);
         INSERT INTO change_log (hlc, device_id, entity, entity_id, field, value)
           VALUES ('h', 'device-a', 'task', 't1', 'title', '\"Write\"');",
    )
    .expect("fills");
}

#[test]
fn migration_0009_keeps_tasks() {
    let dir = TempDir::new("m9rows");
    v8_file(&dir.db());
    drop(Store::open(&dir.db(), "other").expect("opens and migrates"));
    let conn = raw(&dir.db());
    let version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("user_version");
    assert_eq!(version, 9);
    assert_eq!(columns(&conn, "task").last().map(String::as_str), Some("origin"));
    assert_eq!(count(&conn, "SELECT count(*) FROM task"), 2);
    assert_eq!(
        count(&conn, "SELECT count(*) FROM task WHERE origin IS NULL"),
        2
    );
    assert_eq!(count(&conn, "SELECT count(*) FROM change_log"), 1);
    assert_eq!(
        count(
            &conn,
            "SELECT count(*) FROM pragma_index_info('task_origin')"
        ),
        1
    );
}

#[test]
fn origin_check_refuses_bad_values() {
    let dir = TempDir::new("m9check");
    v8_file(&dir.db());
    drop(Store::open(&dir.db(), "other").expect("opens and migrates"));
    let conn = raw(&dir.db());
    let long = format!("a:{}", "k".repeat(299));
    assert_eq!(long.chars().count(), 301);
    for bad in ["x", ":a", "a:", "ab", long.as_str()] {
        let refused = conn.execute("UPDATE task SET origin = ?1 WHERE id = 't1'", [bad]);
        assert!(refused.is_err(), "{bad:?} must be refused");
    }
    for good in ["reminders:x1", "things:A1b2", &format!("a:{}", "k".repeat(298))] {
        conn.execute("UPDATE task SET origin = ?1 WHERE id = 't1'", [good])
            .expect("a well-formed origin is accepted");
    }
}
