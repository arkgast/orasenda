//! Check-ins. **Syncable**: every write logs to `change_log` with `entity = "habit_check"` and
//! `entity_id` = the check id, `<habit_id>:<YYYY-MM-DD>`, so two devices that check in on the
//! same local day write the same row. Only *done* is stored: removing a check-in tombstones it,
//! and checking in again clears the tombstone. `checked_at` always holds the time of the last
//! change, a removal included, so the merge compares `checked_at` alone.

use super::{ms, opt_ms};
use crate::{Entity, StoreError, Txn, sql_int};
use serde_json::Value;

/// A stored check-in.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckRow {
    pub id: String,
    pub habit_id: String,
    /// The local date, `YYYY-MM-DD`.
    pub day: String,
    pub checked_at: u64,
    pub deleted_at: Option<u64>,
}

/// The id of the check-in of `habit_id` on `day`.
pub fn check_id(habit_id: &str, day: &str) -> String {
    format!("{habit_id}:{day}")
}

/// The check-in of `habit_id` on `day`, removed or not.
pub fn get(txn: &Txn, habit_id: &str, day: &str) -> Result<Option<CheckRow>, StoreError> {
    let mut stmt = txn.conn().prepare(
        "SELECT id, habit_id, day, checked_at, deleted_at FROM habit_check WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([check_id(habit_id, day)], read_row)?;
    Ok(rows.next().transpose()?)
}

/// Checks `habit_id` in on `day` at `txn.now_ms()`. A new check-in logs `habit_id`, `day` and
/// `checked_at`; a removed one comes back, clearing `deleted_at`, and logs `checked_at` and
/// `deleted_at`. Returns whether anything changed: a live check-in is left as it is.
/// A `day` that is not `YYYY-MM-DD` fails and writes nothing.
pub fn check_in(txn: &mut Txn, habit_id: &str, day: &str) -> Result<bool, StoreError> {
    let id = check_id(habit_id, day);
    let now = txn.now_ms();
    match get(txn, habit_id, day)? {
        Some(row) if row.deleted_at.is_none() => Ok(false),
        Some(_) => {
            txn.conn().execute(
                "UPDATE habit_check SET checked_at = ?2, deleted_at = NULL WHERE id = ?1",
                rusqlite::params![id, sql_int(now)?],
            )?;
            txn.log_fields(
                Entity::HabitCheck,
                &id,
                &[
                    ("checked_at", Value::from(now)),
                    ("deleted_at", Value::Null),
                ],
            )?;
            Ok(true)
        }
        None => {
            txn.conn().execute(
                "INSERT INTO habit_check (id, habit_id, day, checked_at) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![id, habit_id, day, sql_int(now)?],
            )?;
            txn.log_fields(
                Entity::HabitCheck,
                &id,
                &[
                    ("habit_id", Value::from(habit_id)),
                    ("day", Value::from(day)),
                    ("checked_at", Value::from(now)),
                ],
            )?;
            Ok(true)
        }
    }
}

/// Removes the check-in of `habit_id` on `day`: `deleted_at` and `checked_at` both become
/// `txn.now_ms()`, and both are logged. Returns whether a live check-in was removed.
pub fn remove(txn: &mut Txn, habit_id: &str, day: &str) -> Result<bool, StoreError> {
    let id = check_id(habit_id, day);
    let now = txn.now_ms();
    let changed = txn.conn().execute(
        "UPDATE habit_check SET checked_at = ?2, deleted_at = ?2
         WHERE id = ?1 AND deleted_at IS NULL",
        rusqlite::params![id, sql_int(now)?],
    )?;
    if changed == 0 {
        return Ok(false);
    }
    txn.log_fields(
        Entity::HabitCheck,
        &id,
        &[
            ("checked_at", Value::from(now)),
            ("deleted_at", Value::from(now)),
        ],
    )?;
    Ok(true)
}

/// The live check-ins of `habit_ids` on `from_day` or later, ordered by habit id, then day.
/// No ids means no rows.
pub fn checks_since(
    txn: &Txn,
    habit_ids: &[String],
    from_day: &str,
) -> Result<Vec<CheckRow>, StoreError> {
    if habit_ids.is_empty() {
        return Ok(Vec::new());
    }
    let ids = serde_json::to_string(habit_ids)?;
    let mut stmt = txn.conn().prepare(
        "SELECT id, habit_id, day, checked_at, deleted_at FROM habit_check
         WHERE deleted_at IS NULL AND day >= ?2
           AND habit_id IN (SELECT value FROM json_each(?1))
         ORDER BY habit_id, day",
    )?;
    let rows = stmt.query_map(rusqlite::params![ids, from_day], read_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn read_row(row: &rusqlite::Row) -> rusqlite::Result<CheckRow> {
    Ok(CheckRow {
        id: row.get(0)?,
        habit_id: row.get(1)?,
        day: row.get(2)?,
        checked_at: ms(row, 3)?,
        deleted_at: opt_ms(row, 4)?,
    })
}
