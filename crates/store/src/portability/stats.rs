//! Live row counts for the four syncable tables.

use crate::{StoreError, Txn};

/// How many live rows each syncable table holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Counts {
    pub sessions: u32,
    pub presets: u32,
    pub notes: u32,
    pub settings: u32,
}

/// Counts live rows: tombstones (`deleted_at` set) are skipped. `setting` has no tombstones.
pub fn counts(txn: &Txn) -> Result<Counts, StoreError> {
    let conn = txn.conn();
    let count =
        |sql: &str| -> Result<u32, StoreError> { Ok(conn.query_row(sql, [], |row| row.get(0))?) };
    Ok(Counts {
        sessions: count("SELECT count(*) FROM focus_session WHERE deleted_at IS NULL")?,
        presets: count("SELECT count(*) FROM preset WHERE deleted_at IS NULL")?,
        notes: count("SELECT count(*) FROM inbox_note WHERE deleted_at IS NULL")?,
        settings: count("SELECT count(*) FROM setting")?,
    })
}
