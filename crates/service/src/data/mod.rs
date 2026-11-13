//! Data portability in the service: backup files, their policy and the pending swap that
//! Restore and Delete all data leave for the next launch (spec 2026-11-12, sub-project G).
//! `dir` is always the app data dir; backups live in its `Backups/` folder.

pub mod backups;
mod names;
pub mod pending;
pub mod policy;
mod run;
#[cfg(test)]
mod tests;

pub use pending::PendingOutcome;
pub use run::{
    busy, run_auto_check, run_backups_create, run_backups_delete, run_backups_restore,
    run_backups_set_policy, run_data_delete_all, run_overview,
};
