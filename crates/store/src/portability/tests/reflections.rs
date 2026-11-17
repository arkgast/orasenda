//! Reflections in export and merge import: the per-field rule of the spec (2026-11-16), the one
//! table that does not take the later row whole.

use crate::Store;
use crate::portability::{ReflectionRowAll, SyncRows, merge, rows};
use crate::reflections::{ReflectionKind, ReflectionWrite, upsert};

fn store() -> Store {
    Store::open_in_memory("device-a").expect("opens")
}

fn shutdown_write(went_well: Option<&str>, to_improve: Option<&str>) -> ReflectionWrite {
    ReflectionWrite {
        kind: ReflectionKind::Shutdown,
        period: "2026-11-16".into(),
        went_well: went_well.map(str::to_owned),
        to_improve: to_improve.map(str::to_owned),
        outside_control: None,
        improvement: None,
        notes: None,
        priorities: Vec::new(),
        complete: false,
    }
}

fn row(at: i64) -> ReflectionRowAll {
    ReflectionRowAll {
        id: "shutdown:2026-11-16".into(),
        kind: "shutdown".into(),
        period: "2026-11-16".into(),
        went_well: None,
        to_improve: None,
        outside_control: None,
        improvement: None,
        notes: None,
        priorities: "[]".into(),
        completed_at: None,
        created_at: 1,
        updated_at: at,
        deleted_at: None,
    }
}

fn only(row: ReflectionRowAll) -> SyncRows {
    SyncRows {
        reflections: vec![row],
        ..SyncRows::default()
    }
}

fn all(store: &Store) -> Vec<ReflectionRowAll> {
    store.read(rows).expect("reads").reflections
}

fn logged(store: &Store) -> Vec<String> {
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

/// Local holds `local` (written at 100); then `file` is merged.
fn merged_with(local: &ReflectionRowAll, file: &ReflectionRowAll) -> (Store, u32) {
    let store = store();
    store
        .write(9, |txn| merge(txn, &only(local.clone())))
        .expect("seeds");
    let got = store
        .write(9, |txn| merge(txn, &only(file.clone())))
        .expect("merges");
    (store, got.updated.reflections)
}

#[test]
fn round_trip_reflection() {
    let source = store();
    source
        .write(100, |txn| {
            upsert(txn, &shutdown_write(Some("shipped"), Some("sleep")))?;
            upsert(
                txn,
                &ReflectionWrite {
                    kind: ReflectionKind::Week,
                    period: "2026-11-23".into(),
                    went_well: None,
                    to_improve: None,
                    outside_control: None,
                    improvement: Some("start earlier".into()),
                    notes: Some("a long week".into()),
                    priorities: vec!["t1".into(), "t2".into()],
                    complete: true,
                },
            )
        })
        .expect("saved");
    let exported = source.read(rows).expect("reads");
    assert_eq!(exported.reflections.len(), 2);
    let target = store();
    let got = target
        .write(200, |txn| merge(txn, &exported))
        .expect("merges");
    assert_eq!(got.added.reflections, 2);
    assert_eq!(all(&target), exported.reflections);
    let again = target
        .write(300, |txn| merge(txn, &exported))
        .expect("merges");
    assert_eq!(again.added.reflections + again.updated.reflections, 0);
}

#[test]
fn merge_null_keeps_other_text() {
    // The file is later but never answered "went well"; the local answer stays, and the
    // file's "to improve" arrives.
    let local = ReflectionRowAll {
        went_well: Some("shipped".into()),
        ..row(100)
    };
    let file = ReflectionRowAll {
        to_improve: Some("sleep".into()),
        ..row(200)
    };
    let (store, updated) = merged_with(&local, &file);
    assert_eq!(updated, 1);
    let got = &all(&store)[0];
    assert_eq!(got.went_well.as_deref(), Some("shipped"));
    assert_eq!(got.to_improve.as_deref(), Some("sleep"));
    assert_eq!(got.updated_at, 200);
    // And the other way round: an earlier file with only text the local row lacks.
    let (store, _) = merged_with(&file, &local);
    let got = &all(&store)[0];
    assert_eq!(got.went_well.as_deref(), Some("shipped"));
    assert_eq!(got.to_improve.as_deref(), Some("sleep"));
}

#[test]
fn merge_later_text_wins() {
    let local = ReflectionRowAll {
        went_well: Some("old".into()),
        ..row(100)
    };
    let newer = ReflectionRowAll {
        went_well: Some("new".into()),
        ..row(200)
    };
    let (store, updated) = merged_with(&local, &newer);
    assert_eq!(updated, 1);
    assert_eq!(all(&store)[0].went_well.as_deref(), Some("new"));
    // An earlier file does not replace it, and a tie keeps the local text.
    let (store, updated) = merged_with(&newer, &local);
    assert_eq!(updated, 0);
    assert_eq!(all(&store)[0].went_well.as_deref(), Some("new"));
    let tie = ReflectionRowAll {
        went_well: Some("tie".into()),
        ..row(100)
    };
    let (store, updated) = merged_with(&local, &tie);
    assert_eq!(updated, 0);
    assert_eq!(all(&store)[0].went_well.as_deref(), Some("old"));
}

#[test]
fn merge_priorities_follow_the_later_updated_at() {
    let week = |at, priorities: &str| ReflectionRowAll {
        id: "week:2026-11-23".into(),
        kind: "week".into(),
        period: "2026-11-23".into(),
        priorities: priorities.into(),
        ..row(at)
    };
    let (store, _) = merged_with(&week(100, "[\"a\"]"), &week(200, "[\"b\",\"c\"]"));
    assert_eq!(all(&store)[0].priorities, "[\"b\",\"c\"]");
    let (store, _) = merged_with(&week(200, "[\"b\"]"), &week(100, "[\"a\"]"));
    assert_eq!(all(&store)[0].priorities, "[\"b\"]");
}

#[test]
fn merge_earliest_completed_at() {
    let local = ReflectionRowAll {
        completed_at: Some(150),
        ..row(200)
    };
    let file = ReflectionRowAll {
        completed_at: Some(120),
        ..row(100)
    };
    let (store, updated) = merged_with(&local, &file);
    assert_eq!(updated, 1, "the earlier completion is a change");
    assert_eq!(all(&store)[0].completed_at, Some(120));
    // A NULL on the later side never clears it.
    let open = row(300);
    let (store, updated) = merged_with(&local, &open);
    assert_eq!(updated, 0);
    assert_eq!(all(&store)[0].completed_at, Some(150));
    let (store, _) = merged_with(&open, &local);
    assert_eq!(all(&store)[0].completed_at, Some(150));
}

#[test]
fn merge_later_tombstone_wins() {
    let local = ReflectionRowAll {
        went_well: Some("kept".into()),
        ..row(100)
    };
    let removed = ReflectionRowAll {
        deleted_at: Some(300),
        ..row(300)
    };
    let (store, updated) = merged_with(&local, &removed);
    assert_eq!(updated, 1);
    let got = &all(&store)[0];
    assert_eq!(got.deleted_at, Some(300));
    assert_eq!(got.went_well.as_deref(), Some("kept"));
    // An earlier tombstone does not remove a later row.
    let later = ReflectionRowAll {
        went_well: Some("kept".into()),
        ..row(400)
    };
    let (store, updated) = merged_with(&later, &removed);
    assert_eq!(updated, 0);
    assert_eq!(all(&store)[0].deleted_at, None);
    // A later live row brings a removed one back.
    let (store, _) = merged_with(&removed, &later);
    assert_eq!(all(&store)[0].deleted_at, None);
}

#[test]
fn merge_logs_only_changed_fields() {
    let local = ReflectionRowAll {
        went_well: Some("shipped".into()),
        ..row(100)
    };
    let file = ReflectionRowAll {
        went_well: Some("shipped".into()),
        to_improve: Some("sleep".into()),
        completed_at: Some(150),
        ..row(200)
    };
    let (store, _) = merged_with(&local, &file);
    assert_eq!(
        logged(&store),
        [
            "kind",
            "period",
            "went_well",
            "created_at",
            "to_improve",
            "completed_at"
        ]
    );
    let before = logged(&store).len();
    store
        .write(9, |txn| merge(txn, &only(file.clone())))
        .expect("merges again");
    assert_eq!(logged(&store).len(), before, "an unchanged merge logs nothing");
}

#[test]
fn merge_refuses_invalid_priorities_json() {
    for bad in ["not json", "{\"a\":1}", "[1,2]"] {
        let store = store();
        let week = ReflectionRowAll {
            id: "week:2026-11-23".into(),
            kind: "week".into(),
            period: "2026-11-23".into(),
            priorities: bad.into(),
            ..row(100)
        };
        let file = SyncRows {
            reflections: vec![row(100), week],
            ..SyncRows::default()
        };
        assert!(
            store.write(9, |txn| merge(txn, &file)).is_err(),
            "{bad} is refused"
        );
        assert!(all(&store).is_empty(), "the whole import rolls back");
    }
}
