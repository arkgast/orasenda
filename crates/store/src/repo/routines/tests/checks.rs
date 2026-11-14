use super::*;
use crate::repo::routines::habit_checks as repo;

fn live(store: &Store, ids: &[&str], from: &str) -> Vec<(String, String)> {
    let ids: Vec<String> = ids.iter().map(|id| (*id).to_owned()).collect();
    store
        .read(|txn| {
            Ok(repo::checks_since(txn, &ids, from)?
                .into_iter()
                .map(|c| (c.habit_id, c.day))
                .collect())
        })
        .expect("reads")
}

#[test]
fn check_in_writes_one_row_with_the_day_id() {
    let store = store();
    assert!(
        store
            .write(1_000, |txn| repo::check_in(txn, "h1", "2026-11-14"))
            .expect("checks")
    );
    let row = store
        .read(|txn| repo::get(txn, "h1", "2026-11-14"))
        .expect("reads")
        .expect("row");
    assert_eq!(row.id, "h1:2026-11-14");
    assert_eq!((row.checked_at, row.deleted_at), (1_000, None));
    assert_eq!(
        log(&store, "h1:2026-11-14"),
        [
            ("habit_check".into(), "habit_id".into(), "\"h1\"".into()),
            ("habit_check".into(), "day".into(), "\"2026-11-14\"".into()),
            ("habit_check".into(), "checked_at".into(), "1000".into()),
        ]
    );
    let again = store
        .write(2_000, |txn| repo::check_in(txn, "h1", "2026-11-14"))
        .expect("runs");
    assert!(!again, "checking in twice is idempotent");
    assert_eq!(log_count(&store), 3);
}

#[test]
fn check_remove_tombstones_with_checked_at_and_check_in_again_clears_it() {
    let store = store();
    store
        .write(1_000, |txn| repo::check_in(txn, "h1", "2026-11-14"))
        .expect("checks");
    assert!(
        store
            .write(2_000, |txn| repo::remove(txn, "h1", "2026-11-14"))
            .expect("removes")
    );
    let row = store
        .read(|txn| repo::get(txn, "h1", "2026-11-14"))
        .expect("reads")
        .expect("row");
    assert_eq!((row.checked_at, row.deleted_at), (2_000, Some(2_000)));
    assert_eq!(live(&store, &["h1"], "2026-11-01"), []);
    assert!(
        !store
            .write(2_100, |txn| repo::remove(txn, "h1", "2026-11-14"))
            .expect("runs")
    );

    assert!(
        store
            .write(3_000, |txn| repo::check_in(txn, "h1", "2026-11-14"))
            .expect("checks")
    );
    let row = store
        .read(|txn| repo::get(txn, "h1", "2026-11-14"))
        .expect("reads")
        .expect("row");
    assert_eq!((row.checked_at, row.deleted_at), (3_000, None));
    let tail: Vec<_> = log(&store, "h1:2026-11-14")
        .into_iter()
        .skip(3)
        .map(|(_, f, v)| (f, v))
        .collect();
    assert_eq!(
        tail,
        [
            ("checked_at".to_owned(), "2000".to_owned()),
            ("deleted_at".to_owned(), "2000".to_owned()),
            ("checked_at".to_owned(), "3000".to_owned()),
            ("deleted_at".to_owned(), "null".to_owned()),
        ]
    );
}

#[test]
fn checks_since_filters_habits_days_and_tombstones() {
    let store = store();
    store
        .write(1_000, |txn| {
            repo::check_in(txn, "h2", "2026-11-10")?;
            repo::check_in(txn, "h1", "2026-11-12")?;
            repo::check_in(txn, "h1", "2026-11-01")?;
            repo::check_in(txn, "h1", "2026-11-11")?;
            repo::check_in(txn, "h3", "2026-11-12")?;
            repo::check_in(txn, "h1", "2026-11-13")?;
            repo::remove(txn, "h1", "2026-11-13")?;
            Ok(())
        })
        .expect("writes");
    assert_eq!(
        live(&store, &["h1", "h2"], "2026-11-10"),
        [
            ("h1".to_owned(), "2026-11-11".to_owned()),
            ("h1".to_owned(), "2026-11-12".to_owned()),
            ("h2".to_owned(), "2026-11-10".to_owned()),
        ]
    );
    assert_eq!(live(&store, &[], "2026-01-01"), []);
}

#[test]
fn check_refuses_a_day_that_is_not_iso_and_a_mismatched_id() {
    let store = store();
    for day in ["14/11/2026", "2026-1-14", "", "2026-11-14T00"] {
        assert!(
            store
                .write(1, |txn| repo::check_in(txn, "h1", day))
                .is_err(),
            "{day}"
        );
    }
    assert_eq!(log_count(&store), 0);
    assert!(sql_fails(
        &store,
        "INSERT INTO habit_check (id, habit_id, day, checked_at) VALUES ('x', 'h1', '2026-11-14', 1)"
    ));
}
