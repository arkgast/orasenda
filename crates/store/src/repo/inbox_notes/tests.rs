use super::*;
use crate::Store;
use crate::test_support::count;

fn store() -> Store {
    Store::open_in_memory("device-a").expect("opens")
}

fn note(id: &str, text: &str, kind: NoteKind, created_at: u64) -> NewNote {
    NewNote {
        id: id.to_owned(),
        text: text.to_owned(),
        kind,
        created_at,
    }
}

fn seeded() -> Store {
    let store = store();
    store
        .write(1_000, |txn| {
            insert(txn, &note("a", "first", NoteKind::Internal, 300))?;
            insert(txn, &note("c", "third", NoteKind::Internal, 100))?;
            insert(txn, &note("b", "second", NoteKind::External, 200))
        })
        .expect("inserts");
    store
}

fn ids(store: &Store) -> Vec<String> {
    store
        .read(|txn| Ok(list_live(txn)?.into_iter().map(|n| n.id).collect()))
        .expect("lists")
}

#[test]
fn inbox_insert_logs_change_log() {
    let store = store();
    store
        .write(1_000, |txn| {
            insert(txn, &note("n1", "buy milk", NoteKind::External, 500))
        })
        .expect("inserts");
    let rows: Vec<(String, String, String, String)> = store
        .read(|txn| {
            let mut stmt = txn
                .conn()
                .prepare("SELECT entity, entity_id, field, value FROM change_log ORDER BY seq")?;
            let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
            Ok(rows.collect::<Result<_, _>>()?)
        })
        .expect("reads log");
    let want = |field: &str, value: &str| {
        (
            "inbox_note".to_owned(),
            "n1".to_owned(),
            field.to_owned(),
            value.to_owned(),
        )
    };
    assert_eq!(
        rows,
        [
            want("text", "\"buy milk\""),
            want("kind", "\"external\""),
            want("created_at", "500"),
        ]
    );
    let got = store
        .read(|txn| Ok(list_live(txn)?.pop().expect("one row")))
        .expect("lists");
    assert_eq!(
        got,
        NoteRow {
            id: "n1".into(),
            text: "buy milk".into(),
            kind: NoteKind::External,
            created_at: 500,
            deleted_at: None
        }
    );
}

#[test]
fn inbox_list_live_newest_first_skips_removed() {
    let store = seeded();
    assert_eq!(ids(&store), ["a", "b", "c"]);
    store
        .write(2_000, |txn| remove(txn, "b", 2_000).map(|_| ()))
        .expect("removes");
    assert_eq!(ids(&store), ["a", "c"]);
}

#[test]
fn inbox_remove_restore_idempotent() {
    let store = seeded();
    let write =
        |f: fn(&mut Txn) -> Result<bool, StoreError>| store.write(3_000, f).expect("writes");
    assert!(write(|t| remove(t, "a", 3_000)));
    assert!(
        !write(|t| remove(t, "a", 3_500)),
        "second remove changes nothing"
    );
    assert!(!write(|t| remove(t, "missing", 3_000)));
    let deleted: i64 = store
        .read(|t| {
            Ok(t.conn()
                .query_row("SELECT deleted_at FROM inbox_note WHERE id='a'", [], |r| {
                    r.get(0)
                })?)
        })
        .expect("reads");
    assert_eq!(deleted, 3_000, "the first remove's time stays");
    let logged = |store: &Store| {
        store
            .read(|t| {
                Ok(count(
                    t.conn(),
                    "SELECT count(*) FROM change_log WHERE field = 'deleted_at'",
                ))
            })
            .expect("counts")
    };
    assert_eq!(logged(&store), 1);
    assert!(write(|t| restore(t, "a")));
    assert!(
        !write(|t| restore(t, "a")),
        "second restore changes nothing"
    );
    assert!(!write(|t| restore(t, "missing")));
    assert_eq!(logged(&store), 2);
    assert_eq!(ids(&store), ["a", "b", "c"]);
}

#[test]
fn inbox_text_check_rejects_1001() {
    let store = store();
    let try_insert = |text: String| {
        store.write(1, move |txn| {
            insert(txn, &note("x", &text, NoteKind::Internal, 1))
        })
    };
    assert!(try_insert("a".repeat(1001)).is_err());
    assert!(try_insert(String::new()).is_err());
    try_insert("a".repeat(1000)).expect("1000 is allowed");
    let bad_kind = store.write(1, |txn| {
        txn.conn().execute(
            "INSERT INTO inbox_note (id, text, kind, created_at) VALUES ('k', 't', 'other', 1)",
            [],
        )?;
        Ok(())
    });
    assert!(bad_kind.is_err(), "a bad kind is refused");
    let rows = store
        .read(|t| Ok(count(t.conn(), "SELECT count(*) FROM inbox_note")))
        .expect("counts");
    assert_eq!(rows, 1);
    store
        .write(1, |txn| {
            insert(
                txn,
                &note("y", &"\u{e9}".repeat(1000), NoteKind::Internal, 1),
            )
        })
        .expect("1000 characters (2000 bytes) are allowed");
    let logged = store
        .read(|t| {
            Ok(count(
                t.conn(),
                "SELECT count(*) FROM change_log WHERE entity_id = 'x'",
            ))
        })
        .expect("counts");
    assert_eq!(logged, 3, "a refused insert logs nothing");
}

#[test]
fn migrate_4_to_5_keeps_rows() {
    let mut conn = rusqlite::Connection::open_in_memory().expect("opens");
    for (_, sql) in crate::migrate::MIGRATIONS.iter().filter(|(v, _)| *v <= 4) {
        conn.execute_batch(sql)
            .expect("an earlier migration applies");
    }
    conn.pragma_update(None, "user_version", 4).expect("sets");
    conn.execute(
        "INSERT INTO preset (id, created_at, updated_at, name, focus_min, break_min, long_break_min, rounds, position)
         VALUES ('p', 1, 1, 'Pomodoro', 25, 5, 15, 4, 0)",
        [],
    )
    .expect("a preset row");
    conn.execute(
        "INSERT INTO setting (key, value, updated_at) VALUES ('k', '1', 1)",
        [],
    )
    .expect("a setting row");
    conn.execute_batch(
        "INSERT INTO focus_session (id, created_at, updated_at, preset, phase, planned_ms, started_at, ended_at, paused_total_ms, focused_ms, end_reason)
         VALUES ('s', 1, 1, 'Pomodoro', 'focus', 1500000, 1, 2, 0, 1500000, 'completed');
         INSERT INTO window_frame (window, display, x, y, width, height, updated_at)
         VALUES ('main', 'd', 0, 0, 800, 600, 1);
         INSERT INTO change_log (hlc, device_id, entity, entity_id, field, value)
         VALUES ('h', 'dev', 'setting', 'k', 'value', '1');",
    )
    .expect("more rows");
    crate::migrate::run(&mut conn).expect("migrates");
    for (table, want) in [
        ("preset", 1),
        ("setting", 1),
        ("focus_session", 1),
        ("window_frame", 1),
        ("change_log", 1),
        ("inbox_note", 0),
    ] {
        assert_eq!(count(&conn, &format!("SELECT count(*) FROM {table}")), want);
    }
    let version: u32 = conn
        .pragma_query_value(None, "user_version", |r| r.get(0))
        .expect("version");
    assert_eq!(version, crate::SCHEMA_VERSION);
    assert_eq!(
        count(
            &conn,
            "SELECT count(*) FROM sqlite_schema WHERE name = 'inbox_note_live'"
        ),
        1
    );
}
