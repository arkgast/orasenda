//! Data portability: a consistent copy of the live database, a read-only look at a foreign file,
//! live row counts, and moving syncable rows between database files (spec 2026-11-12,
//! sub-project G).

mod merge;
mod probe;
mod rows;
mod snapshot;
mod stats;
#[cfg(test)]
mod tests;

pub use merge::{MergeCounts, merge};
pub use probe::{Probe, ProbeError, probe};
pub use rows::{NoteRowAll, PresetRowAll, SessionRowAll, SettingRow, SyncRows, rows};
pub use stats::{Counts, counts};
