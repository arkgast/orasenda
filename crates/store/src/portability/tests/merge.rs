use crate::portability::{
    Counts, MergeCounts, NoteRowAll, PresetRowAll, SessionRowAll, SettingRow, SyncRows, merge, rows,
};
use crate::test_support::count;
use crate::{Store, StoreError};

pub(super) fn setting(key: &str, value: &str, at: i64) -> SettingRow {
    SettingRow {
        key: key.into(),
        value: value.into(),
        updated_at: at,
    }
}

pub(super) fn preset(id: &str, name: &str, at: i64, deleted: Option<i64>) -> PresetRowAll {
    PresetRowAll {
        id: id.into(),
        created_at: 1,
        updated_at: at,
        deleted_at: deleted,
        name: name.into(),
        focus_min: 25,
        break_min: 5,
        long_break_min: 15,
        rounds: 4,
        position: 0,
        default_key: None,
    }
}

pub(super) fn session(id: &str, at: i64) -> SessionRowAll {
    SessionRowAll {
        id: id.into(),
        created_at: 100,
        updated_at: at,
        deleted_at: None,
        preset: "library".into(),
        phase: "focus".into(),
        planned_ms: 1_500_000,
        started_at: 10,
        ended_at: 20,
        paused_total_ms: 0,
        focused_ms: 1_500_000,
        end_reason: "completed".into(),
        extensions: 0,
        preset_id: Some("p1".into()),
        preset_name: Some("Classic".into()),
        focus_min: Some(25),
        break_min: Some(5),
        long_break_min: Some(15),
        rounds: Some(4),
        break_kind: None,
    }
}

pub(super) fn note(id: &str, deleted: Option<i64>) -> NoteRowAll {
    NoteRowAll {
        id: id.into(),
        text: "Call the bank".into(),
        kind: "external".into(),
        created_at: 5,
        deleted_at: deleted,
    }
}

fn seed_rows() -> SyncRows {
    SyncRows {
        settings: vec![setting("theme", "\"dark\"", 100)],
        presets: vec![
            preset("p1", "Classic", 200, None),
            preset("p2", "Gone", 300, Some(500)),
        ],
        sessions: vec![session("s1", 400)],
        notes: vec![note("n1", None), note("n2", Some(700))],
    }
}

pub(super) fn seed(store: &Store) {
    store
        .write(1, |txn| merge(txn, &seed_rows()))
        .expect("seeds");
}

fn run(store: &Store, rows: &SyncRows) -> MergeCounts {
    store.write(9, |txn| merge(txn, rows)).expect("merges")
}

fn logs(store: &Store) -> i64 {
    store
        .read(|txn| Ok(count(txn.conn(), "SELECT count(*) FROM change_log")))
        .expect("reads")
}

fn all(store: &Store) -> SyncRows {
    store.read(rows).expect("reads")
}

fn counts(sessions: u32, presets: u32, notes: u32, settings: u32) -> Counts {
    Counts {
        sessions,
        presets,
        notes,
        settings,
    }
}

#[test]
fn merge_inserts_rows_only_in_file() {
    let store = Store::open_in_memory("device-a").expect("opens");
    let before = all(&store);
    let got = run(&store, &seed_rows());
    assert_eq!(got.added, counts(1, 2, 2, 1));
    assert_eq!(got.updated, Counts::default());
    let after = all(&store);
    assert_eq!(after.sessions, seed_rows().sessions);
    assert_eq!(after.notes, seed_rows().notes);
    assert_eq!(after.settings, seed_rows().settings);
    assert_eq!(before.presets.len(), 0);
    assert_eq!(after.presets, seed_rows().presets);
}

#[test]
fn merge_later_updated_at_wins() {
    let store = Store::open_in_memory("device-a").expect("opens");
    seed(&store);
    let file = SyncRows {
        settings: vec![setting("theme", "\"light\"", 101)],
        presets: vec![preset("p1", "Renamed", 201, None)],
        sessions: vec![SessionRowAll {
            focused_ms: 1_000_000,
            ..session("s1", 401)
        }],
        ..SyncRows::default()
    };
    let by_entity = |store: &Store, entity: &str| -> i64 {
        store
            .read(|txn| {
                Ok(txn.conn().query_row(
                    "SELECT count(*) FROM change_log WHERE entity = ?1",
                    [entity],
                    |r| r.get(0),
                )?)
            })
            .expect("reads")
    };
    let kinds = ["setting", "preset", "focus_session"];
    let logged_before = kinds.map(|k| by_entity(&store, k));
    let got = run(&store, &file);
    assert_eq!(got.added, Counts::default());
    assert_eq!(got.updated, counts(1, 1, 0, 1));
    let after = all(&store);
    assert_eq!(after.settings[0].value, "\"light\"");
    assert_eq!(after.settings[0].updated_at, 101);
    assert_eq!(after.sessions, file.sessions);
    let p1 = after.presets.iter().find(|p| p.id == "p1").expect("p1");
    assert_eq!(p1, &file.presets[0]);
    let added = kinds.map(|k| by_entity(&store, k));
    // setting: value; preset: 7 fields plus deleted_at; session: 15 fields plus deleted_at.
    assert_eq!([0, 1, 2].map(|i| added[i] - logged_before[i]), [1, 8, 16]);
}

#[test]
fn merge_earlier_loses() {
    let store = Store::open_in_memory("device-a").expect("opens");
    seed(&store);
    let before = all(&store);
    let file = SyncRows {
        settings: vec![setting("theme", "\"light\"", 99)],
        presets: vec![preset("p1", "Older", 199, None)],
        sessions: vec![session("s1", 399)],
        ..SyncRows::default()
    };
    assert_eq!(run(&store, &file), MergeCounts::default());
    assert_eq!(all(&store), before);
}

#[test]
fn merge_tie_keeps_local() {
    let store = Store::open_in_memory("device-a").expect("opens");
    seed(&store);
    let before = all(&store);
    let file = SyncRows {
        settings: vec![setting("theme", "\"light\"", 100)],
        presets: vec![preset("p1", "Tie", 200, None)],
        sessions: vec![SessionRowAll {
            focused_ms: 1_000_000,
            ..session("s1", 400)
        }],
        ..SyncRows::default()
    };
    assert_eq!(run(&store, &file), MergeCounts::default());
    assert_eq!(all(&store), before);
}

#[test]
fn merge_preset_tombstone_carries() {
    let store = Store::open_in_memory("device-a").expect("opens");
    seed(&store);
    let file = SyncRows {
        presets: vec![preset("p1", "Classic", 250, Some(240))],
        ..SyncRows::default()
    };
    let got = run(&store, &file);
    assert_eq!(got.updated.presets, 1);
    let p1 = all(&store)
        .presets
        .into_iter()
        .find(|p| p.id == "p1")
        .expect("row");
    assert_eq!(p1.deleted_at, Some(240));
    // And a later live copy brings it back.
    let back = SyncRows {
        presets: vec![preset("p1", "Classic", 260, None)],
        ..SyncRows::default()
    };
    run(&store, &back);
    let p1 = all(&store)
        .presets
        .into_iter()
        .find(|p| p.id == "p1")
        .expect("row");
    assert_eq!(p1.deleted_at, None);
}

#[test]
fn merge_note_tombstone_wins_either_side() {
    let store = Store::open_in_memory("device-a").expect("opens");
    seed(&store);
    // The file removed n1; local was live.
    let file = SyncRows {
        notes: vec![
            NoteRowAll {
                text: "Changed".into(),
                ..note("n1", Some(800))
            },
            note("n2", None),
        ],
        ..SyncRows::default()
    };
    let notes_logged = |store: &Store| -> i64 {
        store
            .read(|txn| {
                Ok(count(
                    txn.conn(),
                    "SELECT count(*) FROM change_log WHERE entity = 'inbox_note'",
                ))
            })
            .expect("reads")
    };
    let logged = notes_logged(&store);
    let got = run(&store, &file);
    assert_eq!(got.updated.notes, 1);
    assert_eq!(notes_logged(&store), logged + 1);
    let notes = all(&store).notes;
    let n1 = notes.iter().find(|n| n.id == "n1").expect("n1");
    assert_eq!(
        (n1.deleted_at, n1.text.as_str()),
        (Some(800), "Call the bank")
    );
    // Local removed n2; the live file copy does not bring it back.
    let n2 = notes.iter().find(|n| n.id == "n2").expect("n2");
    assert_eq!(n2.deleted_at, Some(700));
}

#[test]
fn merge_twice_is_noop_no_log_rows() {
    let store = Store::open_in_memory("device-a").expect("opens");
    run(&store, &seed_rows());
    let logged = logs(&store);
    assert!(logged > 0);
    assert_eq!(run(&store, &seed_rows()), MergeCounts::default());
    assert_eq!(logs(&store), logged);
}

#[test]
fn merge_logs_each_field() {
    let store = Store::open_in_memory("device-a").expect("opens");
    let file = SyncRows {
        settings: vec![setting("theme", "\"dark\"", 100)],
        presets: vec![preset("p1", "Classic", 200, None)],
        sessions: vec![session("s1", 400)],
        notes: vec![note("n1", None)],
    };
    run(&store, &file);
    let fields = |entity: &str| -> Vec<String> {
        store
            .read(|txn| {
                let mut stmt = txn.conn().prepare(
                    "SELECT field FROM change_log WHERE entity = ?1 AND device_id = 'device-a'
                     ORDER BY seq",
                )?;
                let rows = stmt.query_map([entity], |row| row.get(0))?;
                Ok(rows.collect::<Result<_, _>>()?)
            })
            .expect("reads")
    };
    assert_eq!(fields("setting"), ["value"]);
    assert_eq!(fields("inbox_note"), ["text", "kind", "created_at"]);
    assert_eq!(
        fields("preset"),
        [
            "name",
            "focus_min",
            "break_min",
            "long_break_min",
            "rounds",
            "position",
            "default_key"
        ]
    );
    let session_fields = fields("focus_session");
    for expected in ["preset", "phase", "planned_ms", "preset_id", "rounds"] {
        assert!(session_fields.iter().any(|f| f == expected), "{expected}");
    }
    assert!(
        !session_fields.iter().any(|f| f == "intent"),
        "no intent field is logged"
    );
}

#[test]
fn merge_error_rolls_back_the_whole_merge() {
    let store = Store::open_in_memory("device-a").expect("opens");
    let file = SyncRows {
        settings: vec![setting("a", "\"x\"", 1)],
        notes: vec![NoteRowAll {
            kind: "bogus".into(),
            ..note("bad", None)
        }],
        ..SyncRows::default()
    };
    let result: Result<MergeCounts, StoreError> = store.write(9, |txn| merge(txn, &file));
    assert!(result.is_err());
    assert!(all(&store).settings.iter().all(|s| s.key != "a"));
}
