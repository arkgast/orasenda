//! Habits. **Syncable**: every write logs to `change_log` with `entity = "habit"` and
//! `entity_id` = the habit id. A habit sits in one routine (`routine_id`) or stands alone
//! (`None`); positions count within that list. A removed habit is a tombstone.

use super::{ms, opt, opt_ms, reorder};
use crate::{Entity, StoreError, Txn, sql_int};
use serde_json::Value;

/// The fields a person edits. Text fields are trimmed by the service; an empty one is `None`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HabitFields {
    /// 1 to 80 characters.
    pub name: String,
    /// *When*, free text up to 80 characters ("at 7:00", "after breakfast").
    pub when_text: Option<String>,
    /// *Where*, up to 80 characters.
    pub where_text: Option<String>,
    /// The cue it follows ("I wake up"), up to 120 characters.
    pub anchor: Option<String>,
    /// The 2-minute version, up to 120 characters.
    pub two_minute: Option<String>,
    /// The identity statement, up to 120 characters.
    pub identity: Option<String>,
    pub optional: bool,
    /// A standalone habit's weekday mask (1 to 127); always `None` inside a routine.
    pub days: Option<u8>,
}

/// A habit to insert. `id` is a UUIDv7 made by the caller.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewHabit {
    pub id: String,
    pub routine_id: Option<String>,
    pub position: u32,
    pub fields: HabitFields,
}

/// A stored habit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HabitRow {
    pub id: String,
    pub routine_id: Option<String>,
    pub position: u32,
    pub fields: HabitFields,
    pub created_at: u64,
    pub updated_at: u64,
    pub deleted_at: Option<u64>,
}

const COLUMNS: &str = "id, routine_id, position, name, when_text, where_text, anchor, two_minute,
    identity, optional, days, created_at, updated_at, deleted_at";

/// Inserts a live habit with `created_at` and `updated_at` set to `txn.now_ms()` and logs
/// every synced field. A field outside its CHECK (days inside a routine included), or a
/// repeated id, fails and writes nothing.
pub fn insert(txn: &mut Txn, habit: &NewHabit) -> Result<(), StoreError> {
    let now = sql_int(txn.now_ms())?;
    let f = &habit.fields;
    txn.conn().execute(
        "INSERT INTO habit (id, routine_id, position, name, when_text, where_text, anchor,
             two_minute, identity, optional, days, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
        rusqlite::params![
            habit.id,
            habit.routine_id,
            habit.position,
            f.name,
            f.when_text,
            f.where_text,
            f.anchor,
            f.two_minute,
            f.identity,
            f.optional,
            f.days,
            now,
        ],
    )?;
    let mut logged = vec![
        ("routine_id", opt(habit.routine_id.clone())),
        ("position", Value::from(habit.position)),
    ];
    logged.extend(fields_of(f));
    logged.push(("created_at", Value::from(txn.now_ms())));
    txn.log_fields(Entity::Habit, &habit.id, &logged)
}

/// The habit with `id`, removed or not.
pub fn get(txn: &Txn, id: &str) -> Result<Option<HabitRow>, StoreError> {
    Ok(query(txn, "WHERE id = ?1", [id])?.pop())
}

/// The live habits of the routine `routine_id`, or the live standalone habits for `None`,
/// ordered by `position`, then `id`.
pub fn list_live(txn: &Txn, routine_id: Option<&str>) -> Result<Vec<HabitRow>, StoreError> {
    query(
        txn,
        "WHERE deleted_at IS NULL AND routine_id IS ?1",
        [routine_id],
    )
}

/// Every live habit, the standalone ones first, then by routine id, `position` and `id`. Habits
/// of a removed routine are tombstoned with it, so none of them is listed.
pub fn list_all_live(txn: &Txn) -> Result<Vec<HabitRow>, StoreError> {
    let mut stmt = txn.conn().prepare(&format!(
        "SELECT {COLUMNS} FROM habit WHERE deleted_at IS NULL
         ORDER BY routine_id IS NOT NULL, routine_id, position, id"
    ))?;
    let rows = stmt.query_map([], read_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// The position after the last live habit of `routine_id` (or of the standalone list).
pub fn next_position(txn: &Txn, routine_id: Option<&str>) -> Result<u32, StoreError> {
    let next: i64 = txn.conn().query_row(
        "SELECT coalesce(max(position) + 1, 0) FROM habit
         WHERE deleted_at IS NULL AND routine_id IS ?1",
        [routine_id],
        |row| row.get(0),
    )?;
    u32::try_from(next).map_err(|_| StoreError::Sqlite(format!("position {next} is out of range")))
}

/// Writes the fields that differ from the live habit `id`, sets `updated_at`, and logs only
/// those fields. Returns whether the habit is live: a removed or missing one changes nothing.
pub fn update(txn: &mut Txn, id: &str, fields: &HabitFields) -> Result<bool, StoreError> {
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
    let f = fields;
    txn.conn().execute(
        "UPDATE habit SET name = ?2, when_text = ?3, where_text = ?4, anchor = ?5,
             two_minute = ?6, identity = ?7, optional = ?8, days = ?9, updated_at = ?10
         WHERE id = ?1",
        rusqlite::params![
            id,
            f.name,
            f.when_text,
            f.where_text,
            f.anchor,
            f.two_minute,
            f.identity,
            f.optional,
            f.days,
            sql_int(txn.now_ms())?
        ],
    )?;
    txn.log_fields(Entity::Habit, id, &changed)?;
    Ok(true)
}

/// Moves the live habit `id` to `to_index` within its own list (its routine, or the standalone
/// habits; past the end means last) and renumbers that list from 0, logging each position that
/// changes. Returns whether the habit is live.
pub fn move_to(txn: &mut Txn, id: &str, to_index: usize) -> Result<bool, StoreError> {
    let Some(habit) = get(txn, id)?.filter(|row| row.deleted_at.is_none()) else {
        return Ok(false);
    };
    let live = list_live(txn, habit.routine_id.as_deref())?
        .into_iter()
        .map(|row| (row.id, row.position))
        .collect();
    reorder(txn, Entity::Habit, live, id, to_index)
}

/// Tombstones the live habit `id` at `txn.now_ms()` and logs `deleted_at`. Returns whether the
/// habit was live.
pub fn remove(txn: &mut Txn, id: &str) -> Result<bool, StoreError> {
    let now = txn.now_ms();
    tombstone(txn, id, Some(now))
}

/// Brings the removed habit `id` back and logs `deleted_at = null`. Returns whether the habit
/// was removed. The service decides whether its routine is live.
pub fn restore(txn: &mut Txn, id: &str) -> Result<bool, StoreError> {
    tombstone(txn, id, None)
}

/// Sets or clears `deleted_at` on a habit that is live (for `Some`) or removed (for `None`),
/// with `updated_at`, and logs it. Returns whether a row changed.
pub(super) fn tombstone(
    txn: &mut Txn,
    id: &str,
    deleted_at: Option<u64>,
) -> Result<bool, StoreError> {
    let from = if deleted_at.is_some() {
        "deleted_at IS NULL"
    } else {
        "deleted_at IS NOT NULL"
    };
    let changed = txn.conn().execute(
        &format!("UPDATE habit SET deleted_at = ?2, updated_at = ?3 WHERE id = ?1 AND {from}"),
        rusqlite::params![
            id,
            deleted_at.map(sql_int).transpose()?,
            sql_int(txn.now_ms())?
        ],
    )?;
    if changed == 0 {
        return Ok(false);
    }
    txn.log_fields(Entity::Habit, id, &[("deleted_at", opt(deleted_at))])?;
    Ok(true)
}

/// The edited fields, always in the same order, so two lists can be zipped.
fn fields_of(f: &HabitFields) -> Vec<(&'static str, Value)> {
    vec![
        ("name", Value::from(f.name.clone())),
        ("when_text", opt(f.when_text.clone())),
        ("where_text", opt(f.where_text.clone())),
        ("anchor", opt(f.anchor.clone())),
        ("two_minute", opt(f.two_minute.clone())),
        ("identity", opt(f.identity.clone())),
        ("optional", Value::from(f.optional)),
        ("days", opt(f.days)),
    ]
}

fn query<P: rusqlite::Params>(
    txn: &Txn,
    filter: &str,
    params: P,
) -> Result<Vec<HabitRow>, StoreError> {
    let mut stmt = txn.conn().prepare(&format!(
        "SELECT {COLUMNS} FROM habit {filter} ORDER BY position, id"
    ))?;
    let rows = stmt.query_map(params, read_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn read_row(row: &rusqlite::Row) -> rusqlite::Result<HabitRow> {
    Ok(HabitRow {
        id: row.get(0)?,
        routine_id: row.get(1)?,
        position: row.get(2)?,
        fields: HabitFields {
            name: row.get(3)?,
            when_text: row.get(4)?,
            where_text: row.get(5)?,
            anchor: row.get(6)?,
            two_minute: row.get(7)?,
            identity: row.get(8)?,
            optional: row.get(9)?,
            days: row.get(10)?,
        },
        created_at: ms(row, 11)?,
        updated_at: ms(row, 12)?,
        deleted_at: opt_ms(row, 13)?,
    })
}
