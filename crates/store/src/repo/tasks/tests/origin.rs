use super::*;

fn with_origin(id: &str, lane: Lane, rank: &str, origin: &str) -> NewTask {
    NewTask {
        origin: Some(origin.to_owned()),
        ..new_task(id, lane, rank)
    }
}

fn ask(store: &Store, wanted: &[&str]) -> Vec<(String, Lane, bool)> {
    let asked: Vec<String> = wanted.iter().map(|o| (*o).to_owned()).collect();
    store.read(|txn| origins(txn, &asked)).expect("reads")
}

#[test]
fn insert_logs_origin() {
    let store = store();
    insert_one(&store, &with_origin("t1", Lane::BACKLOG, "V", "things:A1"));
    assert_eq!(get_row(&store, "t1").origin.as_deref(), Some("things:A1"));
    let log = log_of(&store, "t1");
    assert!(log.contains(&("origin".to_owned(), "\"things:A1\"".to_owned())));
    insert_one(&store, &new_task("t2", Lane::BACKLOG, "W"));
    assert_eq!(get_row(&store, "t2").origin, None);
    assert!(log_of(&store, "t2").iter().all(|(f, _)| f != "origin"));
}

#[test]
fn origins_reports_lane_and_live() {
    let store = store();
    insert_one(&store, &with_origin("t1", Lane::TODAY, "V", "a:1"));
    insert_one(&store, &with_origin("t2", Lane::BACKLOG, "V", "a:2"));
    insert_one(&store, &with_origin("t3", Lane::BACKLOG, "W", "a:2"));
    insert_one(&store, &with_origin("t4", Lane::DOING, "V", "a:4"));
    insert_one(&store, &new_task("t5", Lane::BACKLOG, "X"));
    store
        .write(2_000, |txn| remove(txn, "t3", 2_000))
        .expect("removes");
    assert_eq!(
        ask(&store, &["a:1", "a:2", "a:3"]),
        [
            ("a:1".to_owned(), Lane::TODAY, true),
            ("a:2".to_owned(), Lane::BACKLOG, true),
            ("a:2".to_owned(), Lane::BACKLOG, false),
        ]
    );
    assert_eq!(ask(&store, &[]), []);
}

#[test]
fn origins_orders_by_lane_and_dedups() {
    let store = store();
    insert_one(&store, &with_origin("t6", Lane::DONE, "V", "a:1"));
    insert_one(&store, &with_origin("t7", Lane::TODAY, "V", "a:1"));
    insert_one(&store, &with_origin("t8", Lane::BACKLOG, "V", "a:2"));
    assert_eq!(
        ask(&store, &["a:2", "a:1", "a:2"]),
        [
            ("a:1".to_owned(), Lane::TODAY, true),
            ("a:1".to_owned(), Lane::DONE, true),
            ("a:2".to_owned(), Lane::BACKLOG, true),
        ]
    );
}

#[test]
fn origins_includes_old_done() {
    let store = store();
    insert_one(&store, &with_origin("t1", Lane::DONE, "V", "a:1"));
    store
        .write(1_000_000_000, |txn| {
            txn.conn()
                .execute("UPDATE task SET done_at = 1 WHERE id = 't1'", [])?;
            Ok(())
        })
        .expect("ages the task");
    assert_eq!(
        ask(&store, &["a:1"]),
        [("a:1".to_owned(), Lane::DONE, true)]
    );
}

#[test]
fn last_backlog_rank_counts_tombstones() {
    let store = store();
    let last = |s: &Store| s.read(last_backlog_rank).expect("reads");
    assert_eq!(last(&store), None);
    insert_one(&store, &new_task("t1", Lane::BACKLOG, "V"));
    insert_one(&store, &new_task("t2", Lane::BACKLOG, "Z"));
    insert_one(&store, &new_task("t3", Lane::TODAY, "zz"));
    assert_eq!(last(&store).as_deref(), Some("Z"));
    store
        .write(2_000, |txn| remove(txn, "t2", 2_000))
        .expect("removes");
    assert_eq!(last(&store).as_deref(), Some("Z"));
}
