use crate::portability::rows;
use crate::{Store, presets, settings};

#[test]
fn rows_include_tombstones() {
    let store = Store::open_in_memory("device-a").expect("opens");
    super::merge::seed(&store);
    let all = store.read(rows).expect("reads");
    assert_eq!(all.settings.len(), 1);
    assert_eq!(all.presets.len(), 2);
    assert!(all.presets.iter().any(|p| p.deleted_at == Some(500)));
    assert_eq!(all.sessions.len(), 1);
    assert_eq!(all.sessions[0].preset_name.as_deref(), Some("Classic"));
    assert_eq!(all.notes.len(), 2);
    assert!(all.notes.iter().any(|n| n.deleted_at == Some(700)));
    // The live reads of the repositories do not show the tombstones.
    let live = store.read(presets::list).expect("reads").len();
    assert_eq!(live, 1);
    let value: Option<String> = store
        .read(|txn| settings::get(txn, "theme"))
        .expect("reads");
    assert_eq!(value.as_deref(), Some("dark"));
}

#[test]
fn rows_carry_no_intent() {
    let store = Store::open_in_memory("device-a").expect("opens");
    super::merge::seed(&store);
    // A stray value in the kept column is neither exported nor logged on a merge.
    super::exec(&store, "UPDATE focus_session SET intent = 'Stray'");
    let all = store.read(rows).expect("reads");
    assert_eq!(all.sessions.len(), 1);
    let target = Store::open_in_memory("device-b").expect("opens");
    target
        .write(9, |txn| crate::portability::merge(txn, &all))
        .expect("merges");
    let count = |sql: &'static str| {
        target
            .read(|txn| Ok(crate::test_support::count(txn.conn(), sql)))
            .expect("reads")
    };
    assert_eq!(
        count("SELECT count(*) FROM focus_session WHERE intent IS NOT NULL"),
        0
    );
    assert_eq!(
        count("SELECT count(*) FROM change_log WHERE field = 'intent'"),
        0
    );
}

#[test]
fn import_v5_with_intents_gives_null() {
    use crate::test_support::TempDir;
    let dir = TempDir::new("import-v5-intent");
    let path = dir.path().join("v5.db");
    super::file_at_version(&path, 5);
    let conn = rusqlite::Connection::open(&path).expect("opens");
    conn.execute(
        "INSERT INTO focus_session (id, created_at, updated_at, preset, phase, planned_ms,
            started_at, ended_at, paused_total_ms, focused_ms, end_reason, intent)
         VALUES ('s1', 1, 1, 'quick', 'focus', 1, 1, 2, 0, 1, 'completed', 'Outline')",
        [],
    )
    .expect("session inserts");
    drop(conn);
    // Import opens the file, which migrates it to 0006, then merges its rows.
    let incoming = Store::open(&path, "other").expect("migrates");
    let file_rows = incoming.read(rows).expect("reads");
    let live = Store::open_in_memory("device-a").expect("opens");
    live.write(1, |txn| crate::portability::merge(txn, &file_rows))
        .expect("merges");
    let nulls = live
        .read(|txn| {
            Ok(crate::test_support::count(
                txn.conn(),
                "SELECT count(*) FROM focus_session WHERE intent IS NULL",
            ))
        })
        .expect("reads");
    assert_eq!(nulls, 1);
}
