//! Data portability in the service: backup files, their policy and the pending swap that
//! Restore and Delete all data leave for the next launch (spec 2026-11-12, sub-project G).
//! `dir` is always the app data dir; backups live in its `Backups/` folder.

pub mod backups;
mod names;
pub mod pending;
pub mod policy;
#[cfg(test)]
mod tests;

pub use pending::PendingOutcome;
