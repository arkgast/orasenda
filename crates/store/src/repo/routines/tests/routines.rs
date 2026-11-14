use super::*;
use crate::repo::routines::{habits, routines as repo};

fn seeded() -> Store {
    let store = store();
    store
        .write(1_000, |txn| {
            repo::insert(txn, &routine("b", "Evening", 1))?;
            repo::insert(txn, &routine("a", "Morning", 0))?;
            repo::insert(txn, &routine("c", "Study", 1))
        })
        .expect("inserts");
    store
}

fn ids(store: &Store) -> Vec<String> {
    store
        .read(|txn| Ok(repo::list_live(txn)?.into_iter().map(|r| r.id).collect()))
        .expect("lists")
}

#[test]
fn routine_insert_logs_every_field() {
    let store = store();
    let mut new = routine("r1", "Morning", 0);
    new.template = Some("morningLight".into());
    store
        .write(1_000, |txn| repo::insert(txn, &new))
        .expect("inserts");
    let log = log(&store, "r1");
    assert!(log.iter().all(|(entity, _, _)| entity == "routine"));
    let fields: Vec<_> = log
        .iter()
        .map(|(_, f, v)| (f.as_str(), v.as_str()))
        .collect();
    assert_eq!(
        fields,
        [
            ("name", "\"Morning\""),
            ("time_of_day", "420"),
            ("days", "127"),
            ("template", "\"morningLight\""),
            ("position", "0"),
            ("created_at", "1000"),
        ]
    );
    let row = store.read(|txn| repo::get(txn, "r1")).expect("reads");
    let row = row.expect("stored");
    assert_eq!(row.fields, new.fields);
    assert_eq!(row.template.as_deref(), Some("morningLight"));
    assert_eq!(
        (row.created_at, row.updated_at, row.deleted_at),
        (1_000, 1_000, None)
    );
}

#[test]
fn routine_list_live_orders_by_position_then_id() {
    assert_eq!(ids(&seeded()), ["a", "b", "c"]);
}

#[test]
fn routine_checks_refuse_bad_rows() {
    let store = store();
    let bad = [
        RoutineFields {
            name: String::new(),
            time_of_day: None,
            days: 127,
        },
        RoutineFields {
            name: "x".repeat(81),
            time_of_day: None,
            days: 127,
        },
        RoutineFields {
            name: "Ok".into(),
            time_of_day: Some(1440),
            days: 127,
        },
        RoutineFields {
            name: "Ok".into(),
            time_of_day: None,
            days: 0,
        },
        RoutineFields {
            name: "Ok".into(),
            time_of_day: None,
            days: 128,
        },
    ];
    for fields in bad {
        let new = NewRoutine {
            id: "r".into(),
            fields,
            template: None,
            position: 0,
        };
        assert!(store.write(1, |txn| repo::insert(txn, &new)).is_err());
    }
    assert_eq!(log_count(&store), 0, "a refused insert logs nothing");
}

#[test]
fn routine_update_logs_only_changed_fields() {
    let store = seeded();
    let before = log_count(&store);
    let fields = RoutineFields {
        name: "Morning light".into(),
        time_of_day: Some(420),
        days: 31,
    };
    let live = store
        .write(2_000, |txn| repo::update(txn, "a", &fields))
        .expect("updates");
    assert!(live);
    assert_eq!(log_count(&store), before + 2);
    let tail: Vec<_> = log(&store, "a")
        .into_iter()
        .rev()
        .take(2)
        .map(|(_, f, _)| f)
        .collect();
    assert_eq!(tail, ["days", "name"]);
    let row = store
        .read(|txn| repo::get(txn, "a"))
        .expect("reads")
        .expect("row");
    assert_eq!((row.fields, row.updated_at), (fields.clone(), 2_000));

    let again = store
        .write(3_000, |txn| repo::update(txn, "a", &fields))
        .expect("updates");
    assert!(again, "an unchanged live routine still answers true");
    assert_eq!(
        log_count(&store),
        before + 2,
        "nothing changed, nothing logged"
    );
    let missing = store
        .write(3_000, |txn| repo::update(txn, "zz", &fields))
        .expect("runs");
    assert!(!missing);
}

#[test]
fn routine_move_renumbers_and_logs_changed_positions() {
    let store = seeded();
    let before = log_count(&store);
    let moved = store
        .write(2_000, |txn| repo::move_to(txn, "c", 0))
        .expect("moves");
    assert!(moved);
    assert_eq!(ids(&store), ["c", "a", "b"]);
    let positions = store
        .read(|txn| {
            Ok(repo::list_live(txn)?
                .into_iter()
                .map(|r| r.position)
                .collect::<Vec<_>>())
        })
        .expect("lists");
    assert_eq!(positions, [0, 1, 2]);
    // c 1→0, a 0→1, b 1→2: three positions change.
    assert_eq!(log_count(&store), before + 3);
    let far = store
        .write(3_000, |txn| repo::move_to(txn, "c", 99))
        .expect("moves");
    assert!(far);
    assert_eq!(ids(&store), ["a", "b", "c"]);
    let missing = store
        .write(3_000, |txn| repo::move_to(txn, "zz", 0))
        .expect("runs");
    assert!(!missing);
    assert_eq!(store.read(repo::next_position).expect("reads"), 3);
}

#[test]
fn routine_remove_tombstones_its_habits_in_the_same_transaction() {
    let store = seeded();
    store
        .write(1_500, |txn| {
            habits::insert(txn, &habit("h1", Some("a"), 0))?;
            habits::insert(txn, &habit("h2", Some("a"), 1))?;
            habits::insert(txn, &habit("h3", Some("b"), 0))?;
            habits::insert(txn, &habit("h4", None, 0))
        })
        .expect("inserts");
    store
        .write(1_800, |txn| habits::remove(txn, "h2"))
        .expect("removes");

    let removed = store
        .write(2_000, |txn| repo::remove(txn, "a"))
        .expect("removes");
    assert!(removed);
    assert_eq!(ids(&store), ["b", "c"]);
    let habit_at = |id: &str| {
        store
            .read(|txn| habits::get(txn, id))
            .expect("reads")
            .expect("row")
            .deleted_at
    };
    assert_eq!(habit_at("h1"), Some(2_000));
    assert_eq!(
        habit_at("h2"),
        Some(1_800),
        "an earlier removal keeps its time"
    );
    assert_eq!((habit_at("h3"), habit_at("h4")), (None, None));
    assert_eq!(
        logged_fields(&store, "a").last().map(String::as_str),
        Some("deleted_at")
    );
    assert_eq!(
        logged_fields(&store, "h1").last().map(String::as_str),
        Some("deleted_at")
    );
    let again = store
        .write(2_100, |txn| repo::remove(txn, "a"))
        .expect("runs");
    assert!(!again, "removing a removed routine changes nothing");

    let restored = store
        .write(3_000, |txn| repo::restore(txn, "a"))
        .expect("restores");
    assert!(restored);
    assert_eq!(ids(&store), ["a", "b", "c"]);
    assert_eq!(habit_at("h1"), None, "the removal's habits come back");
    assert_eq!(
        habit_at("h2"),
        Some(1_800),
        "a habit removed on its own stays removed"
    );
    let twice = store
        .write(3_100, |txn| repo::restore(txn, "a"))
        .expect("runs");
    assert!(!twice);
}

#[test]
fn routine_remove_rolls_back_whole_when_the_write_fails() {
    let store = seeded();
    store
        .write(1_500, |txn| habits::insert(txn, &habit("h1", Some("a"), 0)))
        .expect("inserts");
    let failed = store.write(2_000, |txn| {
        repo::remove(txn, "a")?;
        Err::<(), _>(crate::StoreError::Sqlite("later step fails".into()))
    });
    assert!(failed.is_err());
    assert_eq!(ids(&store), ["a", "b", "c"]);
    let h1 = store
        .read(|txn| habits::get(txn, "h1"))
        .expect("reads")
        .expect("row");
    assert_eq!(h1.deleted_at, None);
}
