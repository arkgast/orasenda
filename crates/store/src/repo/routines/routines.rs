//! Routines. **Syncable**: every write logs to `change_log` with `entity = "routine"` and
//! `entity_id` = the routine id. A removed routine is a tombstone, and its live habits are
//! tombstoned in the same transaction at the same time, so a restore can bring back exactly
//! the habits the removal took.

use super::{ms, opt, opt_ms, reorder};
use crate::{Entity, StoreError, Txn, sql_int};
use serde_json::Value;

/// The fields a person edits.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoutineFields {
    /// 1 to 80 characters.
    pub name: String,
    /// Minutes after local midnight, 0 to 1439; `None` is any time.
    pub time_of_day: Option<u16>,
    /// Weekday mask, Monday = 1 … Sunday = 64, 1 to 127.
    pub days: u8,
}

/// A routine to insert. `id` is a UUIDv7 made by the caller.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewRoutine {
    pub id: String,
    pub fields: RoutineFields,
    /// The template id it was copied from, if any. Never changes after the insert.
    pub template: Option<String>,
    pub position: u32,
}

/// A stored routine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoutineRow {
    pub id: String,
    pub fields: RoutineFields,
    pub template: Option<String>,
    pub position: u32,
    pub created_at: u64,
    pub updated_at: u64,
    pub deleted_at: Option<u64>,
}

const COLUMNS: &str =
    "id, name, time_of_day, days, template, position, created_at, updated_at, deleted_at";

/// Inserts a live routine with `created_at` and `updated_at` set to `txn.now_ms()` and logs
/// every synced field. A field outside its CHECK, or a repeated id, fails and writes nothing.
pub fn insert(txn: &mut Txn, routine: &NewRoutine) -> Result<(), StoreError> {
    let now = sql_int(txn.now_ms())?;
    let fields = &routine.fields;
    txn.conn().execute(
        "INSERT INTO routine (id, name, time_of_day, days, template, position, created_at,
             updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        rusqlite::params![
            routine.id,
            fields.name,
            fields.time_of_day,
            fields.days,
            routine.template,
            routine.position,
            now,
        ],
    )?;
    let mut logged = fields_of(fields);
    logged.push(("template", opt(routine.template.clone())));
    logged.push(("position", Value::from(routine.position)));
    logged.push(("created_at", Value::from(txn.now_ms())));
    txn.log_fields(Entity::Routine, &routine.id, &logged)
}

/// The routine with `id`, removed or not.
pub fn get(txn: &Txn, id: &str) -> Result<Option<RoutineRow>, StoreError> {
    Ok(query(txn, "WHERE id = ?1", [id])?.pop())
}

/// The live routines, ordered by `position`, then `id`.
pub fn list_live(txn: &Txn) -> Result<Vec<RoutineRow>, StoreError> {
    query(txn, "WHERE deleted_at IS NULL", [])
}

/// The position after the last live routine: where a new routine goes.
pub fn next_position(txn: &Txn) -> Result<u32, StoreError> {
    let next: i64 = txn.conn().query_row(
        "SELECT coalesce(max(position) + 1, 0) FROM routine WHERE deleted_at IS NULL",
        [],
        |row| row.get(0),
    )?;
    u32::try_from(next).map_err(|_| StoreError::Sqlite(format!("position {next} is out of range")))
}

/// Writes the fields that differ from the live routine `id`, sets `updated_at`, and logs only
/// those fields. Returns whether the routine is live: a removed or missing one changes nothing.
pub fn update(txn: &mut Txn, id: &str, fields: &RoutineFields) -> Result<bool, StoreError> {
    let Some(stored) = get(txn, id)?.filter(|row| row.deleted_at.is_none()) else {
        return Ok(false);
    };
    let changed: Vec<_> = fields_of(fields)
        .into_iter()
        .zip(fields_of(&stored.fields))
        .filter(|(new, old)| new.1 != old.1)
        .map(|(new, _)| new)
        .collect();
    if changed.is_empty() {
        return Ok(true);
    }
    txn.conn().execute(
        "UPDATE routine SET name = ?2, time_of_day = ?3, days = ?4, updated_at = ?5
         WHERE id = ?1",
        rusqlite::params![
            id,
            fields.name,
            fields.time_of_day,
            fields.days,
            sql_int(txn.now_ms())?
        ],
    )?;
    txn.log_fields(Entity::Routine, id, &changed)?;
    Ok(true)
}

/// Moves the live routine `id` to `to_index` among the live routines (past the end means
/// last) and renumbers their positions from 0, logging each position that changes. Returns
/// whether the routine is live.
pub fn move_to(txn: &mut Txn, id: &str, to_index: usize) -> Result<bool, StoreError> {
    let live = list_live(txn)?
        .into_iter()
        .map(|row| (row.id, row.position))
        .collect();
    reorder(txn, Entity::Routine, live, id, to_index)
}

/// Tombstones the live routine `id` and its live habits at `txn.now_ms()`, in this
/// transaction, logging `deleted_at` for each. Returns whether the routine was live.
pub fn remove(txn: &mut Txn, id: &str) -> Result<bool, StoreError> {
    let now = txn.now_ms();
    if !set_deleted(txn, id, Some(now))? {
        return Ok(false);
    }
    let habits: Vec<String> = ids(
        txn,
        "SELECT id FROM habit WHERE routine_id = ?1 AND deleted_at IS NULL ORDER BY id",
        rusqlite::params![id],
    )?;
    for habit in habits {
        super::habits::tombstone(txn, &habit, Some(now))?;
    }
    Ok(true)
}

/// Brings the removed routine `id` back, with the habits its removal tombstoned (those removed
/// at the same moment). Habits removed earlier on their own stay removed. Returns whether the
/// routine was removed.
pub fn restore(txn: &mut Txn, id: &str) -> Result<bool, StoreError> {
    let Some(removed_at) = get(txn, id)?.and_then(|row| row.deleted_at) else {
        return Ok(false);
    };
    set_deleted(txn, id, None)?;
    let habits: Vec<String> = ids(
        txn,
        "SELECT id FROM habit WHERE routine_id = ?1 AND deleted_at = ?2 ORDER BY id",
        rusqlite::params![id, sql_int(removed_at)?],
    )?;
    for habit in habits {
        super::habits::tombstone(txn, &habit, None)?;
    }
    Ok(true)
}

fn set_deleted(txn: &mut Txn, id: &str, deleted_at: Option<u64>) -> Result<bool, StoreError> {
    let from = if deleted_at.is_some() {
        "deleted_at IS NULL"
    } else {
        "deleted_at IS NOT NULL"
    };
    let changed = txn.conn().execute(
        &format!("UPDATE routine SET deleted_at = ?2, updated_at = ?3 WHERE id = ?1 AND {from}"),
        rusqlite::params![
            id,
            deleted_at.map(sql_int).transpose()?,
            sql_int(txn.now_ms())?
        ],
    )?;
    if changed == 0 {
        return Ok(false);
    }
    txn.log_fields(Entity::Routine, id, &[("deleted_at", opt(deleted_at))])?;
    Ok(true)
}

fn ids<P: rusqlite::Params>(txn: &Txn, sql: &str, params: P) -> Result<Vec<String>, StoreError> {
    let mut stmt = txn.conn().prepare(sql)?;
    let rows = stmt.query_map(params, |row| row.get(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// The edited fields, always in the same order, so two lists can be zipped.
fn fields_of(fields: &RoutineFields) -> Vec<(&'static str, Value)> {
    vec![
        ("name", Value::from(fields.name.clone())),
        ("time_of_day", opt(fields.time_of_day)),
        ("days", Value::from(fields.days)),
    ]
}

fn query<P: rusqlite::Params>(
    txn: &Txn,
    filter: &str,
    params: P,
) -> Result<Vec<RoutineRow>, StoreError> {
    let mut stmt = txn.conn().prepare(&format!(
        "SELECT {COLUMNS} FROM routine {filter} ORDER BY position, id"
    ))?;
    let rows = stmt.query_map(params, read_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn read_row(row: &rusqlite::Row) -> rusqlite::Result<RoutineRow> {
    Ok(RoutineRow {
        id: row.get(0)?,
        fields: RoutineFields {
            name: row.get(1)?,
            time_of_day: row.get(2)?,
            days: row.get(3)?,
        },
        template: row.get(4)?,
        position: row.get(5)?,
        created_at: ms(row, 6)?,
        updated_at: ms(row, 7)?,
        deleted_at: opt_ms(row, 8)?,
    })
}
