//! Migration 0007: the four routines tables on a filled v6 file. Earlier rows stay, nothing is
//! logged, and the new tables take writes.

use super::{TempDir, columns, count, raw};
use crate::migrate::MIGRATIONS;
use crate::*;
use std::path::Path;

/// A v6 file with a session, a note, a setting and one change_log row.
fn v6_file(path: &Path) {
    let conn = raw(path);
    for (version, sql) in MIGRATIONS.iter().filter(|(version, _)| *version <= 6) {
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
         INSERT INTO setting (key, value, updated_at) VALUES ('ui.theme', '\"dark\"', 1);
         INSERT INTO change_log (hlc, device_id, entity, entity_id, field, value)
           VALUES ('h', 'device-a', 'inbox_note', 'n1', 'text', '\"x\"');",
    )
    .expect("fills");
}

fn migrated(name: &str) -> (TempDir, Store) {
    let dir = TempDir::new(name);
    v6_file(&dir.db());
    let store = Store::open(&dir.db(), "other").expect("opens and migrates");
    (dir, store)
}

#[test]
fn migration_0007_adds_the_routines_tables_and_keeps_rows() {
    let (dir, store) = migrated("m7tables");
    drop(store);
    let conn = raw(&dir.db());
    let version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("user_version");
    assert_eq!(version, 7);
    assert_eq!(
        columns(&conn, "routine"),
        [
            "id",
            "name",
            "time_of_day",
            "days",
            "template",
            "position",
            "created_at",
            "updated_at",
            "deleted_at"
        ]
    );
    assert_eq!(
        columns(&conn, "habit"),
        [
            "id",
            "routine_id",
            "position",
            "name",
            "when_text",
            "where_text",
            "anchor",
            "two_minute",
            "identity",
            "optional",
            "days",
            "created_at",
            "updated_at",
            "deleted_at"
        ]
    );
    assert_eq!(
        columns(&conn, "habit_check"),
        ["id", "habit_id", "day", "checked_at", "deleted_at"]
    );
    assert_eq!(
        columns(&conn, "routine_run"),
        [
            "id",
            "routine_id",
            "day",
            "started_at",
            "ended_at",
            "outcome",
            "steps_total",
            "steps_done",
            "steps_skipped",
            "step_ids",
            "answers",
            "updated_at"
        ]
    );
    let index = "SELECT count(*) FROM pragma_index_info('habit_check_day')";
    assert_eq!(count(&conn, index), 2, "habit_check(habit_id, day)");
    for table in ["focus_session", "inbox_note", "setting", "change_log"] {
        assert_eq!(
            count(&conn, &format!("SELECT count(*) FROM {table}")),
            1,
            "{table}"
        );
    }
}

#[test]
fn migration_0007_tables_take_writes() {
    let (_dir, store) = migrated("m7writes");
    store
        .write(5_000, |txn| {
            routines::insert(
                txn,
                &routines::NewRoutine {
                    id: "r1".into(),
                    fields: routines::RoutineFields {
                        name: "Morning".into(),
                        time_of_day: None,
                        days: 127,
                    },
                    template: None,
                    position: 0,
                },
            )?;
            routines::habit_checks::check_in(txn, "h1", "2026-11-14")?;
            Ok(())
        })
        .expect("writes");
    let live = store.read(routines::list_live).expect("reads");
    assert_eq!(live.len(), 1);
}
