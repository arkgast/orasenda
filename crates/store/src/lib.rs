//! Orasenda local storage: SQLite in the sync-ready shape of ADR-002, used as ADR-012 says.
//!
//! One [`Store`] holds one connection behind a mutex. Every access is a closure that runs in one
//! SQLite transaction: [`Store::read`] and [`Store::write`]. Repositories ([`settings`],
//! [`focus_sessions`], [`inbox_notes`], [`presets`], [`active_session`], [`window_frames`]) are functions over the [`Txn`] the closure receives.
//! Syncable repositories log every field they write through [`Txn::log_fields`]; device-only
//! ones never touch `change_log`.
//!
//! The store never reads the clock and never makes ids: the caller passes `now_ms` to every
//! write and the device id to [`Store::open`].

mod db;
mod error;
#[cfg(any(test, feature = "test-hooks"))]
mod hooks;
mod migrate;
pub mod portability;
mod repo;
#[cfg(test)]
pub(crate) mod test_support;
#[cfg(test)]
mod tests;
mod txn;

pub use db::Store;
#[cfg(test)]
pub(crate) use db::get_meta;
pub(crate) use db::sql_int;
pub use error::{OpenError, StoreError};
#[cfg(any(test, feature = "test-hooks"))]
pub use hooks::WriteGate;
pub use repo::{
    active_session, focus_sessions, inbox_notes, meta, presets, settings, window_frames,
};
pub use txn::{Entity, Txn};

/// The schema version this build writes, kept only in `PRAGMA user_version` (ADR-012).
pub const SCHEMA_VERSION: u32 = 5;
