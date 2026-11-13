//! `preset`: the file's row wins whole when its `updated_at` is later, tombstone included.

use super::{Outcome, local_updated_at, opt};
use crate::portability::PresetRowAll;
use crate::{Entity, StoreError, Txn};
use serde_json::Value;

pub(super) fn merge_row(txn: &mut Txn, row: &PresetRowAll) -> Result<Outcome, StoreError> {
    let local = local_updated_at(txn, "preset", "id", &row.id)?;
    if local.is_some_and(|at| row.updated_at <= at) {
        return Ok(Outcome::Kept);
    }
    txn.conn().execute(
        "INSERT OR REPLACE INTO preset (id, created_at, updated_at, deleted_at, name, focus_min,
             break_min, long_break_min, rounds, position, default_key)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        rusqlite::params![
            row.id,
            row.created_at,
            row.updated_at,
            row.deleted_at,
            row.name,
            row.focus_min,
            row.break_min,
            row.long_break_min,
            row.rounds,
            row.position,
            row.default_key,
        ],
    )?;
    let mut fields = vec![
        ("name", Value::from(row.name.clone())),
        ("focus_min", Value::from(row.focus_min)),
        ("break_min", Value::from(row.break_min)),
        ("long_break_min", Value::from(row.long_break_min)),
        ("rounds", Value::from(row.rounds)),
        ("position", Value::from(row.position)),
        ("default_key", opt(row.default_key.clone())),
    ];
    // A replaced row may have changed from removed to live, so `deleted_at` is always logged
    // then; a new live row logs none, as an insert does.
    if row.deleted_at.is_some() || local.is_some() {
        fields.push(("deleted_at", opt(row.deleted_at)));
    }
    txn.log_fields(Entity::Preset, &row.id, &fields)?;
    Ok(if local.is_some() {
        Outcome::Updated
    } else {
        Outcome::Added
    })
}
