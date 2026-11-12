//! The preset library. **Syncable**: every write logs to `change_log` with `entity = "preset"`
//! and `entity_id` = the preset id (ADR-002). A removed preset is a tombstone (`deleted_at`),
//! never a deleted row, so it can be restored. Uniqueness and the 12-preset rule are the
//! service's; the store keeps the rows.

use crate::{Entity, StoreError, Txn, sql_int};
use orasenda_core::{DefaultPreset, PresetDef, PresetId};
use rusqlite::Row;
use serde_json::Value;

/// A library row: the preset, its place in the list and whether it was removed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredPreset {
    pub def: PresetDef,
    pub position: u32,
    pub deleted_at: Option<u64>,
}

const COLUMNS: &str = "id, name, focus_min, break_min, long_break_min, rounds, position,
    default_key, deleted_at";

/// The live presets, ordered by `position`.
pub fn list(txn: &Txn) -> Result<Vec<StoredPreset>, StoreError> {
    query(txn, "WHERE deleted_at IS NULL", [])
}

/// Every preset, removed ones included, ordered by `position`.
pub fn list_with_removed(txn: &Txn) -> Result<Vec<StoredPreset>, StoreError> {
    query(txn, "", [])
}

/// The preset with `id`, removed or not, or `None` when there is no such row.
pub fn get(txn: &Txn, id: &PresetId) -> Result<Option<StoredPreset>, StoreError> {
    Ok(query(txn, "WHERE id = ?1", [&id.0])?.pop())
}

/// Inserts `preset` with `created_at` and `updated_at` set to `txn.now_ms()` and logs every
/// synced field. A second insert with the same id fails.
pub fn insert(txn: &mut Txn, preset: &StoredPreset) -> Result<(), StoreError> {
    let def = &preset.def;
    let now = sql_int(txn.now_ms())?;
    let default_key = default_key_text(def.default_key)?;
    txn.conn().execute(
        "INSERT INTO preset (id, created_at, updated_at, deleted_at, name, focus_min, break_min,
             long_break_min, rounds, position, default_key)
         VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        rusqlite::params![
            def.id.0,
            now,
            preset.deleted_at.map(sql_int).transpose()?,
            def.name,
            def.focus_min,
            def.break_min,
            def.long_break_min,
            def.rounds,
            preset.position,
            default_key,
        ],
    )?;
    let mut fields = fields_of(preset);
    if let Some(deleted_at) = preset.deleted_at {
        fields.push(("deleted_at", Value::from(deleted_at)));
    }
    txn.log_fields(Entity::Preset, &def.id.0, &fields)
}

/// Writes the fields of `preset` that differ from the stored row, sets `updated_at`, and logs
/// only those fields. Nothing changed means nothing written. A missing id is an error.
/// `deleted_at` is not touched here: use [`remove`] and [`undelete`].
pub fn update(txn: &mut Txn, preset: &StoredPreset) -> Result<(), StoreError> {
    let stored = require(txn, &preset.def.id)?;
    let changed: Vec<_> = fields_of(preset)
        .into_iter()
        .zip(fields_of(&stored))
        .filter(|(new, old)| new.1 != old.1)
        .map(|(new, _)| new)
        .collect();
    if changed.is_empty() {
        return Ok(());
    }
    let def = &preset.def;
    txn.conn().execute(
        "UPDATE preset SET name = ?2, focus_min = ?3, break_min = ?4, long_break_min = ?5,
             rounds = ?6, position = ?7, default_key = ?8, updated_at = ?9
         WHERE id = ?1",
        rusqlite::params![
            def.id.0,
            def.name,
            def.focus_min,
            def.break_min,
            def.long_break_min,
            def.rounds,
            preset.position,
            default_key_text(def.default_key)?,
            sql_int(txn.now_ms())?,
        ],
    )?;
    txn.log_fields(Entity::Preset, &def.id.0, &changed)
}

/// Removes the preset as a tombstone: `deleted_at = txn.now_ms()`, logged. Removing a removed
/// preset changes nothing; a missing id is an error.
pub fn remove(txn: &mut Txn, id: &PresetId) -> Result<(), StoreError> {
    let stored = require(txn, id)?;
    if stored.deleted_at.is_some() {
        return Ok(());
    }
    set_deleted(txn, id, Some(txn.now_ms()))
}

/// Brings a removed preset back. A live preset changes nothing; a missing id is an error.
pub fn undelete(txn: &mut Txn, id: &PresetId) -> Result<(), StoreError> {
    let stored = require(txn, id)?;
    if stored.deleted_at.is_none() {
        return Ok(());
    }
    set_deleted(txn, id, None)
}

fn set_deleted(txn: &mut Txn, id: &PresetId, deleted_at: Option<u64>) -> Result<(), StoreError> {
    txn.conn().execute(
        "UPDATE preset SET deleted_at = ?2, updated_at = ?3 WHERE id = ?1",
        rusqlite::params![
            id.0,
            deleted_at.map(sql_int).transpose()?,
            sql_int(txn.now_ms())?
        ],
    )?;
    txn.log_fields(
        Entity::Preset,
        &id.0,
        &[("deleted_at", deleted_at.map_or(Value::Null, Value::from))],
    )
}

fn require(txn: &Txn, id: &PresetId) -> Result<StoredPreset, StoreError> {
    get(txn, id)?.ok_or_else(|| StoreError::Sqlite(format!("no preset with id {}", id.0)))
}

/// The synced fields, always in the same order, so two lists can be zipped.
fn fields_of(preset: &StoredPreset) -> Vec<(&'static str, Value)> {
    let def = &preset.def;
    vec![
        ("name", Value::from(def.name.clone())),
        ("focus_min", Value::from(def.focus_min)),
        ("break_min", Value::from(def.break_min)),
        ("long_break_min", Value::from(def.long_break_min)),
        ("rounds", Value::from(def.rounds)),
        ("position", Value::from(preset.position)),
        (
            "default_key",
            serde_json::to_value(def.default_key).unwrap_or(Value::Null),
        ),
    ]
}

fn default_key_text(key: Option<DefaultPreset>) -> Result<Option<String>, StoreError> {
    match key.map(serde_json::to_value).transpose()? {
        None => Ok(None),
        Some(Value::String(name)) => Ok(Some(name)),
        Some(other) => Err(StoreError::Json(format!("expected a string, got {other}"))),
    }
}

fn query<P: rusqlite::Params>(
    txn: &Txn,
    filter: &str,
    params: P,
) -> Result<Vec<StoredPreset>, StoreError> {
    let mut stmt = txn.conn().prepare(&format!(
        "SELECT {COLUMNS} FROM preset {filter} ORDER BY position, created_at, id"
    ))?;
    let rows = stmt.query_map(params, read_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn read_row(row: &Row) -> rusqlite::Result<StoredPreset> {
    let default_key: Option<String> = row.get(7)?;
    let default_key = default_key
        .map(|name| serde_json::from_value(Value::String(name)))
        .transpose()
        .map_err(|err| {
            rusqlite::Error::FromSqlConversionFailure(7, rusqlite::types::Type::Text, Box::new(err))
        })?;
    Ok(StoredPreset {
        def: PresetDef {
            id: PresetId(row.get(0)?),
            name: row.get(1)?,
            focus_min: row.get(2)?,
            break_min: row.get(3)?,
            long_break_min: row.get(4)?,
            rounds: row.get(5)?,
            default_key,
        },
        position: row.get(6)?,
        deleted_at: row
            .get::<_, Option<i64>>(8)?
            .map(|ms| u64::try_from(ms).unwrap_or(0)),
    })
}

#[cfg(test)]
mod tests;
