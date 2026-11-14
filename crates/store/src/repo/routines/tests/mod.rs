//! Shared fixtures for the routines repositories.

mod checks;
mod habits;
mod routines;
mod runs;

use super::habits::{HabitFields, NewHabit};
use super::routines::{NewRoutine, RoutineFields};
use crate::Store;
use crate::test_support::count;

pub(super) fn store() -> Store {
    Store::open_in_memory("device-a").expect("opens")
}

pub(super) fn routine(id: &str, name: &str, position: u32) -> NewRoutine {
    NewRoutine {
        id: id.into(),
        fields: RoutineFields {
            name: name.into(),
            time_of_day: Some(420),
            days: 127,
        },
        template: None,
        position,
    }
}

pub(super) fn fields(name: &str) -> HabitFields {
    HabitFields {
        name: name.into(),
        when_text: None,
        where_text: None,
        anchor: None,
        two_minute: None,
        identity: None,
        optional: false,
        days: None,
    }
}

pub(super) fn habit(id: &str, routine_id: Option<&str>, position: u32) -> NewHabit {
    NewHabit {
        id: id.into(),
        routine_id: routine_id.map(Into::into),
        position,
        fields: fields(&format!("Habit {id}")),
    }
}

/// The `change_log` rows for `entity_id`, as `(entity, field, value)`, in write order.
pub(super) fn log(store: &Store, entity_id: &str) -> Vec<(String, String, String)> {
    store
        .read(|txn| {
            let mut stmt = txn.conn().prepare(
                "SELECT entity, field, value FROM change_log WHERE entity_id = ?1 ORDER BY seq",
            )?;
            let rows = stmt.query_map([entity_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?;
            Ok(rows.collect::<Result<_, _>>()?)
        })
        .expect("reads log")
}

/// The logged field names for `entity_id`, in write order.
pub(super) fn logged_fields(store: &Store, entity_id: &str) -> Vec<String> {
    log(store, entity_id)
        .into_iter()
        .map(|(_, f, _)| f)
        .collect()
}

pub(super) fn log_count(store: &Store) -> i64 {
    store
        .read(|txn| Ok(count(txn.conn(), "SELECT count(*) FROM change_log")))
        .expect("counts")
}

/// Runs raw SQL in a write and returns whether it failed (a CHECK, for instance).
pub(super) fn sql_fails(store: &Store, sql: &str) -> bool {
    store
        .write(1, |txn| Ok(txn.conn().execute_batch(sql)?))
        .is_err()
}
