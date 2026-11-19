//! `Lane` as a string id: the parse rule and the reads that count lanes.

use super::*;

fn custom() -> Lane {
    Lane::parse("c_ab12cd34").expect("a custom id")
}

#[test]
fn lane_parse_accepts_builtins_and_custom_ids() {
    for (text, lane) in [
        ("backlog", Lane::BACKLOG),
        ("today", Lane::TODAY),
        ("doing", Lane::DOING),
        ("done", Lane::DONE),
    ] {
        assert_eq!(Lane::parse(text), Some(lane.clone()));
        assert_eq!(lane.as_str(), text);
    }
    let lane = custom();
    assert_eq!(lane.as_str(), "c_ab12cd34");
    assert_eq!(lane.builtin(), None);
    assert_eq!(Lane::DOING.builtin(), Some(Builtin::Doing));
}

#[test]
fn lane_parse_refuses_bad_ids() {
    for bad in [
        "C_AB12CD34",
        "c_ab12cd3",
        "c_ab12cd345",
        "",
        "c_ab12cd3!",
        "Backlog",
    ] {
        assert_eq!(Lane::parse(bad), None, "{bad:?}");
    }
}

#[test]
fn count_live_in_counts_live_only() {
    let store = store();
    insert_one(&store, &new_task("a", custom(), "V"));
    insert_one(&store, &new_task("b", custom(), "W"));
    insert_one(&store, &new_task("c", custom(), "X"));
    insert_one(&store, &new_task("d", Lane::TODAY, "V"));
    store
        .write(2_000, |txn| remove(txn, "c", 2_000))
        .expect("removes");
    let count = |lane: &Lane| store.read(|txn| count_live_in(txn, lane)).expect("counts");
    assert_eq!(count(&custom()), 2);
    assert_eq!(count(&Lane::TODAY), 1);
    assert_eq!(count(&Lane::DONE), 0);
}

#[test]
fn lanes_live_distinct() {
    let store = store();
    assert_eq!(store.read(lanes_live).expect("reads"), []);
    insert_one(&store, &new_task("a", custom(), "V"));
    insert_one(&store, &new_task("b", custom(), "W"));
    insert_one(&store, &new_task("c", Lane::DONE, "V"));
    insert_one(&store, &new_task("d", Lane::DOING, "V"));
    store
        .write(2_000, |txn| remove(txn, "d", 2_000))
        .expect("removes");
    let mut got = store.read(lanes_live).expect("reads");
    got.sort_by(|a, b| a.as_str().cmp(b.as_str()));
    assert_eq!(got, [custom(), Lane::DONE]);
}

#[test]
fn origins_orders_custom_after_doing() {
    let store = store();
    for (id, lane) in [
        ("t1", Lane::DONE),
        ("t2", custom()),
        ("t3", Lane::DOING),
        ("t4", Lane::BACKLOG),
    ] {
        let task = NewTask {
            origin: Some("a:1".to_owned()),
            ..new_task(id, lane, "V")
        };
        insert_one(&store, &task);
    }
    let asked = ["a:1".to_owned()];
    let lanes: Vec<Lane> = store
        .read(|txn| origins(txn, &asked))
        .expect("reads")
        .into_iter()
        .map(|(_, lane, _)| lane)
        .collect();
    assert_eq!(lanes, [Lane::BACKLOG, Lane::DOING, custom(), Lane::DONE]);
}
