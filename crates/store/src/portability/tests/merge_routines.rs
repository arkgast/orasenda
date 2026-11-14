//! Merge import of the routines tables: the later `updated_at` (for checks, `checked_at`)
//! wins whole, a tombstone counts as a change, a tie keeps the local row.

use crate::Store;
use crate::portability::{
    CheckRowAll, HabitRowAll, MergeCounts, RoutineRowAll, RunRowAll, SyncRows, merge, rows,
};
use crate::test_support::count;

fn routine(id: &str, name: &str, at: i64, deleted: Option<i64>) -> RoutineRowAll {
    RoutineRowAll {
        id: id.into(),
        name: name.into(),
        time_of_day: Some(420),
        days: 127,
        template: Some("morningLight".into()),
        position: 0,
        created_at: 1,
        updated_at: at,
        deleted_at: deleted,
    }
}

fn habit(id: &str, at: i64, deleted: Option<i64>) -> HabitRowAll {
    HabitRowAll {
        id: id.into(),
        routine_id: Some("r1".into()),
        position: 0,
        name: "Drink water".into(),
        when_text: Some("at 7:00".into()),
        where_text: None,
        anchor: Some("I wake up".into()),
        two_minute: None,
        identity: None,
        optional: 0,
        days: None,
        created_at: 1,
        updated_at: at,
        deleted_at: deleted,
    }
}

fn check(habit_id: &str, day: &str, at: i64, deleted: Option<i64>) -> CheckRowAll {
    CheckRowAll {
        id: format!("{habit_id}:{day}"),
        habit_id: habit_id.into(),
        day: day.into(),
        checked_at: at,
        deleted_at: deleted,
    }
}

fn run_row(id: &str, at: i64) -> RunRowAll {
    RunRowAll {
        id: id.into(),
        routine_id: "r1".into(),
        day: "2026-11-14".into(),
        started_at: 10,
        ended_at: None,
        outcome: None,
        steps_total: 2,
        steps_done: 1,
        steps_skipped: 0,
        step_ids: "[\"h1\",\"h2\"]".into(),
        answers: "[\"done\"]".into(),
        updated_at: at,
    }
}

fn file() -> SyncRows {
    SyncRows {
        routines: vec![routine("r1", "Morning", 100, None)],
        habits: vec![habit("h1", 100, None), habit("h2", 100, Some(90))],
        checks: vec![check("h1", "2026-11-14", 100, None)],
        runs: vec![run_row("run1", 100)],
        ..SyncRows::default()
    }
}

fn store() -> Store {
    Store::open_in_memory("device-a").expect("opens")
}

fn merged(store: &Store, rows: &SyncRows) -> MergeCounts {
    store.write(9, |txn| merge(txn, rows)).expect("merges")
}

fn all(store: &Store) -> SyncRows {
    store.read(rows).expect("reads")
}

fn logged(store: &Store, entity: &str) -> Vec<String> {
    store
        .read(|txn| {
            let mut stmt = txn
                .conn()
                .prepare("SELECT field FROM change_log WHERE entity = ?1 ORDER BY seq")?;
            let rows = stmt.query_map([entity], |row| row.get(0))?;
            Ok(rows.collect::<Result<_, _>>()?)
        })
        .expect("reads")
}

#[test]
fn merge_routines_adds_rows_only_in_the_file_and_logs_them() {
    let store = store();
    let got = merged(&store, &file());
    assert_eq!(
        (
            got.added.routines,
            got.added.habits,
            got.added.checks,
            got.added.runs
        ),
        (1, 2, 1, 1)
    );
    let after = all(&store);
    let want = file();
    assert_eq!(
        (after.routines, after.habits, after.checks, after.runs),
        (want.routines, want.habits, want.checks, want.runs)
    );
    assert_eq!(
        logged(&store, "routine"),
        [
            "name",
            "time_of_day",
            "days",
            "template",
            "position",
            "created_at"
        ]
    );
    let habit_fields = logged(&store, "habit");
    assert_eq!(
        habit_fields.iter().filter(|f| *f == "deleted_at").count(),
        1
    );
    assert_eq!(
        logged(&store, "habit_check"),
        ["habit_id", "day", "checked_at"]
    );
    let run_fields = logged(&store, "routine_run");
    for field in ["routine_id", "step_ids", "answers", "steps_done"] {
        assert!(run_fields.iter().any(|f| f == field), "{field}");
    }
    assert!(
        !run_fields.iter().any(|f| f == "ended_at"),
        "an open run logs no end"
    );
}

#[test]
fn merge_routines_later_wins_and_earlier_or_tie_keeps_local() {
    let store = store();
    merged(&store, &file());
    let stale = SyncRows {
        routines: vec![routine("r1", "Older", 100, None)],
        habits: vec![HabitRowAll {
            name: "Older".into(),
            ..habit("h1", 99, None)
        }],
        checks: vec![check("h1", "2026-11-14", 100, Some(100))],
        runs: vec![RunRowAll {
            steps_done: 0,
            answers: "[]".into(),
            ..run_row("run1", 50)
        }],
        ..SyncRows::default()
    };
    let before = all(&store);
    assert_eq!(merged(&store, &stale), MergeCounts::default());
    assert_eq!(all(&store), before);

    let newer = SyncRows {
        routines: vec![routine("r1", "Morning light", 200, None)],
        runs: vec![RunRowAll {
            ended_at: Some(150),
            outcome: Some("finished".into()),
            steps_done: 2,
            answers: "[\"done\",\"done\"]".into(),
            ..run_row("run1", 150)
        }],
        ..SyncRows::default()
    };
    let got = merged(&store, &newer);
    assert_eq!((got.updated.routines, got.updated.runs), (1, 1));
    let after = all(&store);
    assert_eq!(after.routines, newer.routines);
    assert_eq!(after.runs, newer.runs);
}

#[test]
fn merge_routines_tombstones_count_as_changes() {
    let store = store();
    merged(&store, &file());
    // The file removed the routine and the check-in later; a tombstone sets checked_at.
    let removed = SyncRows {
        routines: vec![routine("r1", "Morning", 300, Some(300))],
        habits: vec![habit("h1", 300, Some(300))],
        checks: vec![check("h1", "2026-11-14", 300, Some(300))],
        ..SyncRows::default()
    };
    let got = merged(&store, &removed);
    assert_eq!(
        (got.updated.routines, got.updated.habits, got.updated.checks),
        (1, 1, 1)
    );
    let after = all(&store);
    assert_eq!(after.routines[0].deleted_at, Some(300));
    assert_eq!(after.checks[0].deleted_at, Some(300));
    let live = store
        .read(|txn| {
            Ok(count(
                txn.conn(),
                "SELECT count(*) FROM habit_check WHERE deleted_at IS NULL",
            ))
        })
        .expect("counts");
    assert_eq!(live, 0);
    // A later check-in on the other device brings it back.
    let back = SyncRows {
        checks: vec![check("h1", "2026-11-14", 400, None)],
        ..SyncRows::default()
    };
    assert_eq!(merged(&store, &back).updated.checks, 1);
    assert_eq!(all(&store).checks[0].deleted_at, None);
}

#[test]
fn merge_routines_twice_logs_nothing_more() {
    let store = store();
    merged(&store, &file());
    let logs = |store: &Store| {
        store
            .read(|txn| Ok(count(txn.conn(), "SELECT count(*) FROM change_log")))
            .expect("counts")
    };
    let first = logs(&store);
    assert_eq!(merged(&store, &file()), MergeCounts::default());
    assert_eq!(logs(&store), first);
}

#[test]
fn merge_routines_refuses_a_bad_row_whole() {
    let store = store();
    let bad = SyncRows {
        routines: vec![routine("r1", "Morning", 100, None)],
        runs: vec![RunRowAll {
            steps_total: 5,
            ..run_row("run1", 100)
        }],
        ..SyncRows::default()
    };
    assert!(store.write(9, |txn| merge(txn, &bad)).is_err());
    assert!(
        all(&store).routines.is_empty(),
        "the whole merge rolls back"
    );
}
