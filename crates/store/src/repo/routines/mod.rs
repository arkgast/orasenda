//! Routines and habits (P4, spec 2026-11-14): four **Syncable** repositories over the tables of
//! migration 0007. Every write logs its fields to `change_log` (ADR-002, ADR-012), and removal
//! is a tombstone, never a deleted row.
//!
//! - [`routines`]: ordered routines; removing one also tombstones its habits.
//! - [`habits`]: the habits of one routine, or the standalone ones.
//! - [`habit_checks`]: one check-in per habit and local day, id `<habit_id>:<YYYY-MM-DD>`.
//! - [`routine_runs`]: one pass through a routine, with its step order frozen at start.
//!
//! The store keeps rows; the limits, trimming and run rules are the service's. Days are local
//! ISO dates (`YYYY-MM-DD`) made by the caller; the store never reads the clock.

pub mod habit_checks;
pub mod habits;
pub mod routine_runs;
#[allow(clippy::module_inception)]
pub mod routines;

pub use routines::{
    NewRoutine, RoutineFields, RoutineRow, get, insert, list_live, move_to, next_position, remove,
    restore, update,
};

use crate::{Entity, StoreError, Txn, sql_int};
use serde_json::Value;

/// Reads a millisecond column that must not be negative.
pub(super) fn ms(row: &rusqlite::Row, index: usize) -> rusqlite::Result<u64> {
    let value: i64 = row.get(index)?;
    u64::try_from(value).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(index, value))
}

/// Reads an optional millisecond column that must not be negative.
pub(super) fn opt_ms(row: &rusqlite::Row, index: usize) -> rusqlite::Result<Option<u64>> {
    row.get::<_, Option<i64>>(index)?
        .map(|value| {
            u64::try_from(value).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(index, value))
        })
        .transpose()
}

/// `Null` for an absent value.
pub(super) fn opt<T: Into<Value>>(value: Option<T>) -> Value {
    value.map_or(Value::Null, Into::into)
}

/// Moves `id` to `to_index` (clamped to the end) in the live list `ids` and writes
/// `position = index` for every row whose position changes, with `updated_at` and a logged
/// `position`. `ids` is the live list in order with each row's stored position. Returns
/// whether `id` was in the list.
pub(super) fn reorder(
    txn: &mut Txn,
    entity: Entity,
    live: Vec<(String, u32)>,
    id: &str,
    to_index: usize,
) -> Result<bool, StoreError> {
    let Some(from) = live.iter().position(|(row_id, _)| row_id == id) else {
        return Ok(false);
    };
    let mut order = live;
    let moved = order.remove(from);
    order.insert(to_index.min(order.len()), moved);
    let now = sql_int(txn.now_ms())?;
    for (index, (row_id, stored)) in order.iter().enumerate() {
        let index = u32::try_from(index)
            .map_err(|_| StoreError::Sqlite(format!("position {index} is out of range")))?;
        if *stored == index {
            continue;
        }
        txn.conn().execute(
            &format!(
                "UPDATE {} SET position = ?2, updated_at = ?3 WHERE id = ?1",
                entity.table()
            ),
            rusqlite::params![row_id, index, now],
        )?;
        txn.log_fields(entity, row_id, &[("position", Value::from(index))])?;
    }
    Ok(true)
}

#[cfg(test)]
mod tests;
