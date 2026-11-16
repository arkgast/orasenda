//! Shared helpers for the task repository tests.

use super::*;
use crate::Store;

mod checks;
mod lanes;
mod origin;
mod tracked;
mod writes;

pub(super) fn store() -> Store {
    Store::open_in_memory("device-a").expect("opens")
}

pub(super) fn new_task(id: &str, lane: Lane, rank: &str) -> NewTask {
    NewTask {
        id: id.to_owned(),
        title: format!("Task {id}"),
        notes: String::new(),
        tags: Vec::new(),
        kind: TaskKind::Deep,
        estimate: None,
        due: None,
        priority: None,
        checklist: Vec::new(),
        lane,
        rank: rank.to_owned(),
        frog_day: None,
        source_note_id: None,
        origin: None,
        created_at: 500,
    }
}

pub(super) fn insert_one(store: &Store, task: &NewTask) {
    store
        .write(1_000, |txn| insert(txn, task))
        .expect("inserts");
}

pub(super) fn get_row(store: &Store, id: &str) -> TaskRow {
    store
        .read(|txn| get(txn, id))
        .expect("reads")
        .expect("the task exists")
}

/// The (field, value) pairs logged for `entity_id`, oldest first.
pub(super) fn log_of(store: &Store, entity_id: &str) -> Vec<(String, String)> {
    store
        .read(|txn| {
            let mut stmt = txn.conn().prepare(
                "SELECT field, value FROM change_log
                 WHERE entity = 'task' AND entity_id = ?1 ORDER BY seq",
            )?;
            let rows = stmt.query_map([entity_id], |r| Ok((r.get(0)?, r.get(1)?)))?;
            Ok(rows.collect::<Result<_, _>>()?)
        })
        .expect("reads log")
}

pub(super) fn log_len(store: &Store) -> i64 {
    store
        .read(|txn| {
            Ok(crate::test_support::count(
                txn.conn(),
                "SELECT count(*) FROM change_log",
            ))
        })
        .expect("counts")
}
