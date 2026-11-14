use super::merge::session;
use crate::portability::{Counts, SessionRowAll, SyncRows, TaskRowAll, counts, merge, rows};
use crate::test_support::{TempDir, count};
use crate::{Store, StoreError};

fn task(id: &str, title: &str, at: i64, deleted: Option<i64>) -> TaskRowAll {
    TaskRowAll {
        id: id.into(),
        title: title.into(),
        notes: "Some notes".into(),
        tags: "[\"work\"]".into(),
        kind: "deep".into(),
        estimate: Some(3),
        due: Some("2026-11-20".into()),
        priority: Some("high".into()),
        checklist: "[{\"id\":\"c1\",\"text\":\"Step\",\"done\":false}]".into(),
        lane: "today".into(),
        rank: "V".into(),
        frog_day: Some("2026-11-14".into()),
        breakdown_dismissed: 1,
        source_note_id: Some("n1".into()),
        done_at: None,
        created_at: 10,
        updated_at: at,
        deleted_at: deleted,
    }
}

fn merged(store: &Store, rows: &SyncRows) {
    store.write(9, |txn| merge(txn, rows)).expect("merges");
}

fn only(tasks: Vec<TaskRowAll>) -> SyncRows {
    SyncRows {
        tasks,
        ..SyncRows::default()
    }
}

fn read_tasks(store: &Store) -> Vec<TaskRowAll> {
    store.read(rows).expect("reads").tasks
}

#[test]
fn round_trip_keeps_tasks() {
    let a = Store::open_in_memory("device-a").expect("opens");
    let linked = SessionRowAll {
        task_id: Some("t1".into()),
        ..session("s1", 400)
    };
    let source = SyncRows {
        tasks: vec![
            task("t1", "Write", 50, None),
            task("t2", "Gone", 60, Some(70)),
        ],
        sessions: vec![linked],
        ..SyncRows::default()
    };
    merged(&a, &source);
    let exported = a.read(rows).expect("reads");
    assert_eq!(exported.tasks, source.tasks);
    assert_eq!(exported.sessions[0].task_id.as_deref(), Some("t1"));
    // A file copy (the export) opens and reads back the same rows.
    let dir = TempDir::new("round-trip-tasks");
    let path = dir.path().join("export.db");
    a.snapshot_to(&path).expect("copies");
    let copy = Store::open(&path, "device-b").expect("opens");
    let copied = copy.read(rows).expect("reads");
    assert_eq!(copied.tasks, source.tasks);
    assert_eq!(copied.sessions, exported.sessions);
}

#[test]
fn merge_keeps_session_task_id() {
    let store = Store::open_in_memory("device-a").expect("opens");
    let linked = SessionRowAll {
        task_id: Some("t1".into()),
        ..session("s1", 400)
    };
    merged(
        &store,
        &SyncRows {
            sessions: vec![linked],
            ..SyncRows::default()
        },
    );
    let log = store
        .read(|txn| {
            Ok(count(
                txn.conn(),
                "SELECT count(*) FROM change_log WHERE entity = 'focus_session'
                   AND field = 'task_id' AND value = '\"t1\"'",
            ))
        })
        .expect("reads");
    assert_eq!(log, 1);
    // A later copy without the link replaces the row whole.
    let unlinked = SessionRowAll {
        task_id: None,
        ..session("s1", 401)
    };
    merged(
        &store,
        &SyncRows {
            sessions: vec![unlinked],
            ..SyncRows::default()
        },
    );
    assert_eq!(store.read(rows).expect("reads").sessions[0].task_id, None);
}

#[test]
fn merge_newest_task_wins() {
    let store = Store::open_in_memory("device-a").expect("opens");
    merged(&store, &only(vec![task("t1", "Old", 100, None)]));
    // Older and equal copies lose.
    let counts_kept = store
        .write(9, |txn| {
            merge(
                txn,
                &only(vec![
                    task("t1", "Older", 99, None),
                    task("t1", "Same", 100, None),
                ]),
            )
        })
        .expect("merges");
    assert_eq!(counts_kept.updated, Counts::default());
    assert_eq!(read_tasks(&store)[0].title, "Old");
    let got = store
        .write(9, |txn| {
            merge(txn, &only(vec![task("t1", "New", 101, None)]))
        })
        .expect("merges");
    assert_eq!(got.updated.tasks, 1);
    assert_eq!(read_tasks(&store)[0].title, "New");
}

#[test]
fn tombstone_wins_only_when_newer() {
    let store = Store::open_in_memory("device-a").expect("opens");
    merged(&store, &only(vec![task("t1", "Live", 100, None)]));
    merged(&store, &only(vec![task("t1", "Live", 200, Some(200))]));
    assert_eq!(read_tasks(&store)[0].deleted_at, Some(200));
    // An older live copy does not bring it back; a newer one does.
    merged(&store, &only(vec![task("t1", "Live", 150, None)]));
    assert_eq!(read_tasks(&store)[0].deleted_at, Some(200));
    merged(&store, &only(vec![task("t1", "Back", 300, None)]));
    assert_eq!(read_tasks(&store)[0].deleted_at, None);
    let got = store.read(counts).expect("counts");
    assert_eq!(got.tasks, 1);
}

#[test]
fn merged_tasks_log_change_rows() {
    let store = Store::open_in_memory("device-a").expect("opens");
    merged(&store, &only(vec![task("t1", "Write", 100, None)]));
    let logged = store
        .read(|txn| {
            Ok(count(
                txn.conn(),
                "SELECT count(*) FROM change_log WHERE entity = 'task' AND entity_id = 't1'
                   AND field = 'title'",
            ))
        })
        .expect("reads");
    assert_eq!(logged, 1);
}

#[test]
fn two_frogs_one_day_are_kept() {
    let store = Store::open_in_memory("device-a").expect("opens");
    let mut second = task("t2", "Other", 90, None);
    second.rank = "W".into();
    merged(&store, &only(vec![task("t1", "Write", 100, None), second]));
    let frogs = read_tasks(&store)
        .iter()
        .filter(|t| t.frog_day.as_deref() == Some("2026-11-14"))
        .count();
    assert_eq!(frogs, 2);
}

#[test]
fn bad_rank_goes_to_the_end_of_its_lane() {
    let store = Store::open_in_memory("device-a").expect("opens");
    let mut bad = task("t3", "Bad", 100, None);
    bad.rank = "a-b!".into();
    let mut empty = task("t4", "Empty", 100, None);
    empty.rank = String::new();
    merged(&store, &only(vec![task("t1", "A", 100, None), bad, empty]));
    let tasks = read_tasks(&store);
    let rank = |id: &str| {
        tasks
            .iter()
            .find(|t| t.id == id)
            .expect("task")
            .rank
            .clone()
    };
    assert!(rank("t3") > rank("t1"), "{} vs {}", rank("t3"), rank("t1"));
    assert!(rank("t3").bytes().all(|b| b.is_ascii_alphanumeric()));
    assert_ne!(rank("t3"), rank("t4"));
    assert!(rank("t4") > rank("t3"));
}

#[test]
fn corrupt_task_fails_the_merge() {
    let store = Store::open_in_memory("device-a").expect("opens");
    let mut bad = task("t1", "Bad", 100, None);
    bad.lane = "elsewhere".into();
    let result: Result<_, StoreError> = store.write(9, |txn| merge(txn, &only(vec![bad])));
    assert!(result.is_err());
    assert!(read_tasks(&store).is_empty());
}

#[test]
fn counts_skip_removed_tasks() {
    let store = Store::open_in_memory("device-a").expect("opens");
    merged(
        &store,
        &only(vec![task("t1", "A", 1, None), task("t2", "B", 1, Some(2))]),
    );
    assert_eq!(store.read(counts).expect("counts").tasks, 1);
}

#[test]
fn v7_export_imports_into_v8() {
    let dir = TempDir::new("import-v7");
    let path = dir.path().join("v7.db");
    super::file_at_version(&path, 7);
    let conn = rusqlite::Connection::open(&path).expect("opens");
    conn.execute(
        "INSERT INTO focus_session (id, created_at, updated_at, preset, phase, planned_ms,
            started_at, ended_at, paused_total_ms, focused_ms, end_reason)
         VALUES ('s1', 1, 1, 'quick', 'focus', 1, 1, 2, 0, 1, 'completed')",
        [],
    )
    .expect("session inserts");
    drop(conn);
    let incoming = Store::open(&path, "other").expect("migrates");
    let file_rows = incoming.read(rows).expect("reads");
    assert!(file_rows.tasks.is_empty());
    let live = Store::open_in_memory("device-a").expect("opens");
    let got = live.write(1, |txn| merge(txn, &file_rows)).expect("merges");
    assert_eq!(got.added.sessions, 1);
    let all = live.read(rows).expect("reads");
    assert_eq!(all.sessions[0].task_id, None);
    assert!(all.tasks.is_empty());
}
