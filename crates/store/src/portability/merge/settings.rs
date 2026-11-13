//! `setting`: the file's value wins when its `updated_at` is later.

use super::{Outcome, local_updated_at};
use crate::portability::SettingRow;
use crate::{Entity, StoreError, Txn};

pub(super) fn merge_row(txn: &mut Txn, row: &SettingRow) -> Result<Outcome, StoreError> {
    let local = local_updated_at(txn, "setting", "key", &row.key)?;
    if local.is_some_and(|at| row.updated_at <= at) {
        return Ok(Outcome::Kept);
    }
    let value: serde_json::Value = serde_json::from_str(&row.value)?;
    txn.conn().execute(
        "INSERT INTO setting (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        (&row.key, &row.value, row.updated_at),
    )?;
    txn.log_fields(Entity::Setting, &row.key, &[("value", value)])?;
    Ok(if local.is_some() {
        Outcome::Updated
    } else {
        Outcome::Added
    })
}
