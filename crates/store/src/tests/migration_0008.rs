//! Migration 0008: the task table and `focus_session.task_id` on a filled v7 file. Earlier rows
//! stay, old sessions get a NULL task, nothing is logged.

use super::{TempDir, columns, count, raw};
use crate::migrate::MIGRATIONS;
use crate::*;
use std::path::Path;

fn v7_file(path: &Path) {
    let conn = raw(path);
    for (version, sql) in MIGRATIONS.iter().filter(|(version, _)| *version <= 7) {
        conn.execute_batch(sql).expect("migration applies");
        conn.pragma_update(None, "user_version", version)
            .expect("version");
    }
    conn.execute_batch(
        "INSERT INTO meta (key, value) VALUES ('device_id', 'device-a');
         INSERT INTO focus_session (id, created_at, updated_at, preset, phase, planned_ms,
             started_at, ended_at, paused_total_ms, focused_ms, end_reason)
           VALUES ('s1', 1, 1, 'classic', 'focus', 1, 1, 2, 0, 1, 'completed');
         INSERT INTO inbox_note (id, text, kind, created_at) VALUES ('n1', 'x', 'internal', 1);
         INSERT INTO routine (id, name, position, created_at, updated_at)
           VALUES ('r1', 'Morning', 0, 1, 1);
         INSERT INTO setting (key, value, updated_at) VALUES ('ui.theme', '\"dark\"', 1);
         INSERT INTO change_log (hlc, device_id, entity, entity_id, field, value)
           VALUES ('h', 'device-a', 'inbox_note', 'n1', 'text', '\"x\"');",
    )
    .expect("fills");
}

#[test]
fn migration_7_to_8_keeps_rows() {
    let dir = TempDir::new("m8rows");
    v7_file(&dir.db());
    drop(Store::open(&dir.db(), "other").expect("opens and migrates"));
    let conn = raw(&dir.db());
    let version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("user_version");
    assert_eq!(version, SCHEMA_VERSION);
    assert_eq!(
        columns(&conn, "task"),
        [
            "id",
            "title",
            "notes",
            "tags",
            "kind",
            "estimate",
            "due",
            "priority",
            "checklist",
            "lane",
            "rank",
            "frog_day",
            "breakdown_dismissed",
            "source_note_id",
            "done_at",
            "created_at",
            "updated_at",
            "deleted_at",
            "origin"
        ]
    );
    assert!(columns(&conn, "focus_session").contains(&"task_id".to_owned()));
    assert_eq!(
        count(
            &conn,
            "SELECT count(*) FROM focus_session WHERE task_id IS NULL"
        ),
        1
    );
    for table in [
        "focus_session",
        "inbox_note",
        "routine",
        "setting",
        "change_log",
    ] {
        assert_eq!(
            count(&conn, &format!("SELECT count(*) FROM {table}")),
            1,
            "{table}"
        );
    }
    assert_eq!(count(&conn, "SELECT count(*) FROM task"), 0);
    assert_eq!(
        count(
            &conn,
            "SELECT count(*) FROM pragma_index_info('focus_session_task')"
        ),
        1
    );
}
