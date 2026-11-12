//! Device-level flags in the `meta` table. **Device-only**: nothing here syncs, so this module
//! never writes `change_log` (ADR-012).

use crate::{StoreError, Txn};
use rusqlite::OptionalExtension;

/// The value stored under `key`, or `None` when it is absent.
pub fn get(txn: &Txn, key: &str) -> Result<Option<String>, StoreError> {
    Ok(txn
        .conn()
        .query_row("SELECT value FROM meta WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .optional()?)
}

/// Removes `key`. Removing an absent key is not an error.
pub fn remove(txn: &Txn, key: &str) -> Result<(), StoreError> {
    txn.conn()
        .execute("DELETE FROM meta WHERE key = ?1", [key])?;
    Ok(())
}

/// Sets `key` to `value`, replacing what was there.
pub fn set(txn: &Txn, key: &str, value: &str) -> Result<(), StoreError> {
    txn.conn().execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        (key, value),
    )?;
    Ok(())
}
