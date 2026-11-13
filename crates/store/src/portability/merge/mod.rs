//! Merges rows from another database file into this one, by id (spec: Merge rules).
//!
//! Each table has its own file. A row only in the file is inserted; on both sides the later
//! `updated_at` wins and a tie keeps the local row. Every written row logs every field through
//! `Txn::log_fields`; an unchanged row logs nothing.

mod notes;
mod presets;
mod sessions;
mod settings;

use super::{Counts, SyncRows};
use crate::{StoreError, Txn};
use rusqlite::OptionalExtension;

/// What a merge wrote: rows only in the file, and rows the file replaced.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct MergeCounts {
    pub added: Counts,
    pub updated: Counts,
}

/// What merging one row did.
pub(super) enum Outcome {
    Added,
    Updated,
    Kept,
}

impl Outcome {
    pub(super) fn tally(self, added: &mut u32, updated: &mut u32) {
        match self {
            Outcome::Added => *added += 1,
            Outcome::Updated => *updated += 1,
            Outcome::Kept => {}
        }
    }
}

/// Applies `rows` in the caller's write transaction. Any error leaves the caller to roll back.
pub fn merge(txn: &mut Txn, rows: &SyncRows) -> Result<MergeCounts, StoreError> {
    let mut counts = MergeCounts::default();
    for row in &rows.settings {
        let (a, u) = (&mut counts.added.settings, &mut counts.updated.settings);
        settings::merge_row(txn, row)?.tally(a, u);
    }
    for row in &rows.presets {
        let (a, u) = (&mut counts.added.presets, &mut counts.updated.presets);
        presets::merge_row(txn, row)?.tally(a, u);
    }
    for row in &rows.sessions {
        let (a, u) = (&mut counts.added.sessions, &mut counts.updated.sessions);
        sessions::merge_row(txn, row)?.tally(a, u);
    }
    for row in &rows.notes {
        let (a, u) = (&mut counts.added.notes, &mut counts.updated.notes);
        notes::merge_row(txn, row)?.tally(a, u);
    }
    Ok(counts)
}

/// The local `updated_at` of the row with `key` in `table`, or `None` when it is absent.
/// `table` and `key_column` are constants of the callers, never user text.
pub(super) fn local_updated_at(
    txn: &Txn,
    table: &str,
    key_column: &str,
    key: &str,
) -> Result<Option<i64>, StoreError> {
    Ok(txn
        .conn()
        .query_row(
            &format!("SELECT updated_at FROM {table} WHERE {key_column} = ?1"),
            [key],
            |row| row.get(0),
        )
        .optional()?)
}

/// `Null` for an absent value.
pub(super) fn opt<T: Into<serde_json::Value>>(value: Option<T>) -> serde_json::Value {
    value.map_or(serde_json::Value::Null, Into::into)
}
