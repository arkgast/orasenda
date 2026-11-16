use super::*;
use crate::Store;

fn store() -> Store {
    Store::open_in_memory("device-a").expect("opens")
}

fn shutdown(day: &str, went_well: Option<&str>) -> ReflectionWrite {
    ReflectionWrite {
        kind: ReflectionKind::Shutdown,
        period: day.to_owned(),
        went_well: went_well.map(str::to_owned),
        to_improve: None,
        outside_control: None,
        improvement: None,
        notes: None,
        priorities: Vec::new(),
        complete: false,
    }
}

fn week(monday: &str, priorities: &[&str]) -> ReflectionWrite {
    ReflectionWrite {
        kind: ReflectionKind::Week,
        improvement: Some("start earlier".to_owned()),
        priorities: priorities.iter().map(|p| (*p).to_owned()).collect(),
        ..shutdown(monday, None)
    }
}

fn save(store: &Store, at: u64, write: &ReflectionWrite) -> String {
    store.write(at, |txn| upsert(txn, write)).expect("saves")
}

fn fields(store: &Store) -> Vec<String> {
    store
        .read(|txn| {
            let mut stmt = txn
                .conn()
                .prepare("SELECT field FROM change_log WHERE entity = 'reflection' ORDER BY seq")?;
            let rows = stmt.query_map([], |r| r.get(0))?;
            Ok(rows.collect::<Result<_, _>>()?)
        })
        .expect("reads log")
}

fn row(store: &Store, id: &str) -> ReflectionRow {
    store
        .read(|txn| get(txn, id))
        .expect("reads")
        .expect("exists")
}

#[test]
fn ids_follow_kind_and_period() {
    let store = store();
    assert_eq!(
        save(&store, 1, &shutdown("2026-11-16", None)),
        "shutdown:2026-11-16"
    );
    assert_eq!(save(&store, 1, &week("2026-11-16", &[])), "week:2026-11-16");
}

#[test]
fn upsert_logs_only_changed_fields() {
    let store = store();
    let mut w = shutdown("2026-11-16", Some("a walk"));
    save(&store, 1_000, &w);
    assert_eq!(
        fields(&store),
        ["kind", "period", "went_well", "created_at"]
    );
    let before = fields(&store).len();
    w.to_improve = Some("sleep".to_owned());
    save(&store, 2_000, &w);
    assert_eq!(fields(&store)[before..], ["to_improve"]);
    let r = row(&store, "shutdown:2026-11-16");
    assert_eq!(r.to_improve.as_deref(), Some("sleep"));
    assert_eq!((r.created_at, r.updated_at), (1_000, 2_000));
}

#[test]
fn upsert_unchanged_logs_nothing() {
    let store = store();
    let w = week("2026-11-16", &["t1", "t2"]);
    save(&store, 1_000, &w);
    let before = fields(&store).len();
    save(&store, 5_000, &w);
    assert_eq!(fields(&store).len(), before);
    assert_eq!(row(&store, "week:2026-11-16").updated_at, 1_000);
}

#[test]
fn upsert_logs_priorities_and_clearing_a_text() {
    let store = store();
    let mut w = week("2026-11-16", &["t1"]);
    save(&store, 1_000, &w);
    let before = fields(&store).len();
    w.priorities = vec!["t2".to_owned(), "t1".to_owned()];
    w.improvement = None;
    save(&store, 2_000, &w);
    assert_eq!(fields(&store)[before..], ["improvement", "priorities"]);
    let r = row(&store, "week:2026-11-16");
    assert_eq!(r.priorities, ["t2", "t1"]);
    assert_eq!(r.improvement, None);
}

#[test]
fn upsert_keeps_first_completed_at() {
    let store = store();
    let mut w = shutdown("2026-11-16", Some("x"));
    save(&store, 1_000, &w);
    assert_eq!(row(&store, "shutdown:2026-11-16").completed_at, None);
    w.complete = true;
    save(&store, 2_000, &w);
    assert_eq!(row(&store, "shutdown:2026-11-16").completed_at, Some(2_000));
    w.went_well = Some("y".to_owned());
    save(&store, 3_000, &w);
    w.complete = false;
    w.went_well = Some("z".to_owned());
    save(&store, 4_000, &w);
    let r = row(&store, "shutdown:2026-11-16");
    assert_eq!(r.completed_at, Some(2_000));
    assert_eq!(r.went_well.as_deref(), Some("z"));
    assert_eq!(
        fields(&store)
            .iter()
            .filter(|f| *f == "completed_at")
            .count(),
        1
    );
}

#[test]
fn insert_complete_sets_completed_at() {
    let store = store();
    let mut w = week("2026-11-16", &[]);
    w.complete = true;
    save(&store, 1_000, &w);
    assert_eq!(row(&store, "week:2026-11-16").completed_at, Some(1_000));
    assert!(fields(&store).contains(&"completed_at".to_owned()));
}

#[test]
fn list_skips_tombstones() {
    let store = store();
    for day in ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-25"] {
        save(&store, 1_000, &shutdown(day, Some("x")));
    }
    save(&store, 1_000, &week("2026-11-16", &[]));
    store
        .write(2_000, |txn| {
            txn.conn().execute(
                "UPDATE reflection SET deleted_at = 2000 WHERE id = 'shutdown:2026-11-17'",
                [],
            )?;
            Ok(())
        })
        .expect("tombstones");
    let periods: Vec<String> = store
        .read(|txn| {
            Ok(
                list(txn, ReflectionKind::Shutdown, "2026-11-16", "2026-11-22")?
                    .into_iter()
                    .map(|r| r.period)
                    .collect(),
            )
        })
        .expect("lists");
    assert_eq!(periods, ["2026-11-16", "2026-11-18"]);
}

#[test]
fn a_removed_reflection_comes_back_on_save() {
    let store = store();
    let w = shutdown("2026-11-16", Some("x"));
    save(&store, 1_000, &w);
    store
        .write(2_000, |txn| {
            txn.conn()
                .execute("UPDATE reflection SET deleted_at = 2000", [])?;
            Ok(())
        })
        .expect("tombstones");
    save(&store, 3_000, &w);
    assert_eq!(row(&store, "shutdown:2026-11-16").deleted_at, None);
    assert!(fields(&store).contains(&"deleted_at".to_owned()));
}

#[test]
fn a_wrong_kind_field_fails_and_writes_nothing() {
    let store = store();
    let mut w = shutdown("2026-11-16", None);
    w.notes = Some("not for a shutdown".to_owned());
    assert!(store.write(1_000, |txn| upsert(txn, &w)).is_err());
    assert!(fields(&store).is_empty());
}
