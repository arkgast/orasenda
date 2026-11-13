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
    let _ = txn;
    todo!()
}
