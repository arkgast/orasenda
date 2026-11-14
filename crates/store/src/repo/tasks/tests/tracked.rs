use super::*;
use orasenda_core::{EndReason, Phase, SessionId, SessionPreset, SessionRecord};

fn record(id: &str, phase: Phase, focused_ms: u64, task: Option<&str>) -> SessionRecord {
    SessionRecord {
        id: SessionId(id.into()),
        preset: SessionPreset::Quick,
        phase,
        planned_ms: 1_500_000,
        started_ms: 1_000,
        ended_ms: 2_000,
        paused_total_ms: 0,
        focused_ms,
        end_reason: EndReason::Completed,
        extensions: 0,
        break_kind: None,
        task_id: task.map(str::to_owned),
    }
}

#[test]
fn tracked_sums_focus_rows_only() {
    let store = store();
    store
        .write(9_000, |txn| {
            crate::focus_sessions::insert(txn, &record("s1", Phase::Focus, 100, Some("a")))?;
            crate::focus_sessions::insert(txn, &record("s2", Phase::Focus, 250, Some("a")))?;
            crate::focus_sessions::insert(txn, &record("s3", Phase::Focus, 70, Some("b")))?;
            crate::focus_sessions::insert(txn, &record("s4", Phase::Focus, 999, Some("gone")))?;
            crate::focus_sessions::insert(txn, &record("s5", Phase::Focus, 5, None))?;
            // A break row carrying the id is not tracked time.
            crate::focus_sessions::insert(txn, &record("s6", Phase::Break, 400, Some("a")))?;
            txn.conn()
                .execute("UPDATE focus_session SET deleted_at = 1 WHERE id = 's4'", [])?;
            Ok(())
        })
        .expect("inserts");
    let got = store.read(tracked).expect("sums");
    assert_eq!(
        got,
        [
            Tracked { task_id: "a".into(), focused_ms: 350, sessions: 2 },
            Tracked { task_id: "b".into(), focused_ms: 70, sessions: 1 },
        ]
    );
}

#[test]
fn focus_session_insert_writes_task_id() {
    let store = store();
    store
        .write(9_000, |txn| {
            crate::focus_sessions::insert(txn, &record("s1", Phase::Focus, 1, Some("a")))?;
            crate::focus_sessions::insert(txn, &record("s2", Phase::Focus, 1, None))
        })
        .expect("inserts");
    let ids: Vec<Option<String>> = store
        .read(|txn| {
            let mut stmt = txn
                .conn()
                .prepare("SELECT task_id FROM focus_session ORDER BY id")?;
            let rows = stmt.query_map([], |r| r.get(0))?;
            Ok(rows.collect::<Result<_, _>>()?)
        })
        .expect("reads");
    assert_eq!(ids, [Some("a".to_owned()), None]);
    let logged = |id: &str| -> Vec<String> {
        store
            .read(|txn| {
                let mut stmt = txn.conn().prepare(
                    "SELECT value FROM change_log WHERE entity_id = ?1 AND field = 'task_id'",
                )?;
                let rows = stmt.query_map([id], |r| r.get(0))?;
                Ok(rows.collect::<Result<_, _>>()?)
            })
            .expect("reads log")
    };
    assert_eq!(logged("s1"), ["\"a\""]);
    assert!(logged("s2").is_empty(), "no task, no log row");
}

#[test]
fn list_done_since_is_newest_first() {
    let store = store();
    for (id, rank) in [("a", "V"), ("b", "W"), ("c", "X"), ("d", "Y")] {
        insert_one(&store, &new_task(id, Lane::Doing, rank));
    }
    for (id, at) in [("a", 100), ("b", 300), ("c", 200)] {
        store.write(at, |txn| move_to(txn, id, Lane::Done, "V")).expect("moves");
    }
    store.write(400, |txn| remove(txn, "c", 400)).expect("removes");
    let got = store.read(|txn| list_done_since(txn, 150)).expect("lists");
    // a is too old, c is removed, d is not done.
    assert_eq!(got.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), ["b"]);
    let all = store.read(|txn| list_done_since(txn, 0)).expect("lists");
    assert_eq!(all.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), ["b", "a"]);
}
