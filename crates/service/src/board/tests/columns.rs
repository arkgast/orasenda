//! How the `board.columns` setting row reads: the old shape, a missing built-in, extra custom
//! entries and the saved folds.

use super::*;
use crate::api::BoardError;
use crate::session::lock;
use crate::session::test_support::relaunch;
use serde_json::{Value, json};

/// Writes `row` as the setting row, as another device or an older app would have left it.
fn put_row(host: &TestHost, row: Value) {
    let service = lock(&host.0.service);
    service
        .store()
        .expect("store")
        .write(T0, |txn| {
            orasenda_store::settings::set(txn, super::super::columns::KEY, &row)
        })
        .expect("written");
}

fn shown(host: &TestHost) -> Vec<(String, String, Option<u8>, bool, bool)> {
    run_board_get(host)
        .expect("reads")
        .columns
        .into_iter()
        .map(|c| {
            (
                c.lane.as_str().to_owned(),
                c.name,
                c.limit,
                c.custom,
                c.folded,
            )
        })
        .collect()
}

fn names(host: &TestHost) -> Vec<String> {
    shown(host).into_iter().map(|c| c.1).collect()
}

#[test]
fn old_row_shape_reads() {
    let host = host();
    put_row(
        &host,
        json!([
            { "lane": "backlog", "name": "Later", "limit": null },
            { "lane": "today", "name": "Now", "limit": 5 },
            { "lane": "doing", "name": "Busy", "limit": 2 },
            { "lane": "done", "name": "Finished", "limit": null },
        ]),
    );
    assert_eq!(
        shown(&host),
        [
            ("backlog".into(), "Later".into(), None, false, false),
            ("today".into(), "Now".into(), Some(5), false, false),
            ("doing".into(), "Busy".into(), Some(2), false, false),
            ("done".into(), "Finished".into(), None, false, true),
        ],
        "array position orders them, and Done is folded by default"
    );
}

#[test]
fn missing_builtin_restored() {
    let host = host();
    put_row(
        &host,
        json!([
            { "lane": "backlog", "name": "Later", "limit": null, "order": 0, "folded": false },
            { "lane": "today", "name": "Now", "limit": 5, "order": 1, "folded": false },
            { "lane": "done", "name": "Finished", "limit": null, "order": 2, "folded": false },
        ]),
    );
    assert_eq!(names(&host), ["Later", "Now", "Doing", "Finished"]);
    let doing = &shown(&host)[2];
    assert_eq!(
        (doing.2, doing.4),
        (Some(1), false),
        "its default limit and fold"
    );
    assert!(!shown(&host)[3].4, "a saved open Done stays open");
}

#[test]
fn extra_custom_trimmed() {
    let host = host();
    let mut row = vec![json!({ "lane": "backlog", "name": "Backlog", "limit": null, "order": 0 })];
    for n in 1..=6 {
        row.push(json!({
            "lane": format!("c_aaaaaaa{n}"), "name": format!("Extra {n}"), "limit": null, "order": n,
        }));
    }
    row.push(json!({ "lane": "today", "name": "Today", "limit": 3, "order": 7 }));
    row.push(json!({ "lane": "doing", "name": "Doing", "limit": 1, "order": 8 }));
    row.push(json!({ "lane": "done", "name": "Done", "limit": null, "order": 9 }));
    put_row(&host, Value::Array(row));
    let lanes: Vec<String> = shown(&host).into_iter().map(|c| c.0).collect();
    assert_eq!(
        lanes,
        [
            "backlog",
            "c_aaaaaaa1",
            "c_aaaaaaa2",
            "c_aaaaaaa3",
            "c_aaaaaaa4",
            "today",
            "doing",
            "done"
        ]
    );
    assert!(shown(&host)[1].3, "custom columns say so");
}

#[test]
fn bad_custom_entries_are_dropped_and_builtins_keep_their_order() {
    let host = host();
    put_row(
        &host,
        json!([
            { "lane": "done", "name": "Done", "limit": null, "order": 0 },
            { "lane": "c_aaaaaaa1", "name": "  ", "limit": null, "order": 1 },
            { "lane": "c_aaaaaaa2", "name": "Review", "limit": 12, "order": 2 },
            { "lane": "c_aaaaaaa3", "name": "Review", "limit": 2, "order": 3 },
            { "lane": "backlog", "name": "Backlog", "limit": null, "order": 4 },
            { "lane": "doing", "name": "Doing", "limit": 1, "order": 5 },
            { "lane": "today", "name": "Today", "limit": 3, "order": 6 },
        ]),
    );
    let lanes: Vec<String> = shown(&host).into_iter().map(|c| c.0).collect();
    assert_eq!(lanes, ["backlog", "c_aaaaaaa3", "today", "doing", "done"]);
}

#[test]
fn a_custom_column_before_backlog_moves_after_it() {
    let host = host();
    put_row(
        &host,
        json!([
            { "lane": "c_aaaaaaa1", "name": "Review", "limit": null, "order": 0 },
            { "lane": "backlog", "name": "Backlog", "limit": null, "order": 1 },
            { "lane": "today", "name": "Today", "limit": 3, "order": 2 },
            { "lane": "doing", "name": "Doing", "limit": 1, "order": 3 },
            { "lane": "done", "name": "Done", "limit": null, "order": 4 },
        ]),
    );
    let lanes: Vec<String> = shown(&host).into_iter().map(|c| c.0).collect();
    assert_eq!(lanes, ["backlog", "c_aaaaaaa1", "today", "doing", "done"]);
}

#[test]
fn fold_saved() {
    let host = host();
    run_board_column_fold(&host, Lane::DONE, false).expect("opens Done");
    run_board_column_fold(&host, Lane::TODAY, true).expect("folds Today");
    let unknown = Lane::parse("c_zzzzzzzz").expect("an id");
    assert_eq!(
        run_board_column_fold(&host, unknown, true),
        Err(BoardError::ColumnNotFound)
    );
    let again = relaunch(&mut lock(&host.0.service), T0);
    let board = again.board_build(T0).expect("reads");
    let folded: Vec<_> = board.columns.iter().map(|c| c.folded).collect();
    assert_eq!(
        folded,
        [false, true, false, false],
        "read back from the store"
    );
}
