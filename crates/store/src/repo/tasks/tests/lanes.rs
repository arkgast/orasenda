use super::*;

fn ids(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| (*s).to_owned()).collect()
}

fn seeded() -> Store {
    let store = store();
    insert_one(&store, &new_task("b1", Lane::Backlog, "M"));
    insert_one(&store, &new_task("t1", Lane::Today, "A"));
    insert_one(&store, &new_task("t2", Lane::Doing, "B"));
    insert_one(&store, &new_task("t3", Lane::Today, "C"));
    store
}

fn backlog_order(store: &Store) -> Vec<String> {
    let mut rows: Vec<TaskRow> = ["b1", "t1", "t2", "t3"]
        .iter()
        .map(|id| get_row(store, id))
        .filter(|r| r.lane == Lane::Backlog)
        .collect();
    rows.sort_by(|a, b| a.rank.cmp(&b.rank));
    rows.into_iter().map(|r| r.id).collect()
}

#[test]
fn move_to_backlog_end_keeps_order() {
    let store = seeded();
    store
        .write(2_000, |txn| {
            move_to_backlog_end(txn, &ids(&["t3", "t1", "t2"]))
        })
        .expect("moves");
    assert_eq!(backlog_order(&store), ["b1", "t3", "t1", "t2"]);
    let tail = get_row(&store, "t2");
    assert!(tail.rank > get_row(&store, "b1").rank);
    assert!(
        log_of(&store, "t3")
            .iter()
            .any(|(f, v)| f == "lane" && v == "\"backlog\"")
    );
    assert!(log_of(&store, "t3").iter().any(|(f, _)| f == "rank"));
}

#[test]
fn move_returns_lanes_before() {
    let store = seeded();
    let before = store
        .write(2_000, |txn| {
            move_to_backlog_end(txn, &ids(&["t2", "t1", "t2"]))
        })
        .expect("moves");
    assert_eq!(
        before,
        [
            LaneBefore {
                id: "t2".into(),
                lane: Lane::Doing,
                rank: "B".into()
            },
            LaneBefore {
                id: "t1".into(),
                lane: Lane::Today,
                rank: "A".into()
            },
        ]
    );
}

#[test]
fn move_skips_removed() {
    let store = seeded();
    store
        .write(1_500, |txn| remove(txn, "t1", 1_500))
        .expect("removes");
    let before = store
        .write(2_000, |txn| {
            move_to_backlog_end(txn, &ids(&["t1", "t2", "ghost"]))
        })
        .expect("moves");
    assert_eq!(before.len(), 1);
    assert_eq!(before[0].id, "t2");
    assert_eq!(get_row(&store, "t1").lane, Lane::Today);
}

#[test]
fn restore_lanes_restores_rank() {
    let store = seeded();
    let before = store
        .write(2_000, |txn| move_to_backlog_end(txn, &ids(&["t1", "t2"])))
        .expect("moves");
    store
        .write(3_000, |txn| restore_lanes(txn, &before))
        .expect("restores");
    for (id, lane, rank) in [("t1", Lane::Today, "A"), ("t2", Lane::Doing, "B")] {
        let row = get_row(&store, id);
        assert_eq!((row.lane, row.rank.as_str()), (lane, rank));
    }
    assert!(
        log_of(&store, "t1")
            .iter()
            .any(|(f, v)| f == "rank" && v == "\"A\"")
    );
}

#[test]
fn restore_leaves_removed_task_removed() {
    let store = seeded();
    let before = store
        .write(2_000, |txn| move_to_backlog_end(txn, &ids(&["t1", "t2"])))
        .expect("moves");
    store
        .write(2_500, |txn| remove(txn, "t1", 2_500))
        .expect("removes");
    store
        .write(3_000, |txn| restore_lanes(txn, &before))
        .expect("restores");
    let gone = get_row(&store, "t1");
    assert!(gone.deleted_at.is_some());
    assert_eq!(gone.lane, Lane::Backlog);
    assert_eq!(get_row(&store, "t2").lane, Lane::Doing);
}
