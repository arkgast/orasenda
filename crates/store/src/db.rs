//! The [`Store`]: one connection behind a mutex, opened, migrated and read or written in
//! transactions.

#[cfg(any(test, feature = "test-hooks"))]
use crate::hooks;
use crate::migrate;
use crate::{OpenError, SCHEMA_VERSION, StoreError, Txn};
use orasenda_core::{Hlc, HlcStamp};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior};
use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};

const META_DEVICE_ID: &str = "device_id";
const META_HLC_LAST: &str = "hlc_last";

/// What the mutex guards: the clock lives with the connection, so a stamp is never handed out
/// without the transaction that writes its row.
struct Inner {
    conn: Connection,
    hlc: Hlc,
}

/// The local database. `Send + Sync`; share it behind an `Arc`.
pub struct Store {
    inner: Mutex<Inner>,
    device_id: String,
    #[cfg(any(test, feature = "test-hooks"))]
    pub(crate) hooks: hooks::Hooks,
}

impl Store {
    /// Opens (or creates) the database file at `path`, switches it to WAL and runs the
    /// migrations. `new_device_id` becomes `meta.device_id` only when the file has none yet.
    ///
    /// Does not create parent directories: the caller does. A file whose `user_version` is
    /// newer than [`SCHEMA_VERSION`] is refused with [`OpenError::Newer`] before anything is
    /// written to it.
    pub fn open(path: &Path, new_device_id: &str) -> Result<Store, OpenError> {
        Store::from_connection(Connection::open(path)?, Backing::File, new_device_id)
    }

    /// An in-memory database with the full schema, for tests.
    pub fn open_in_memory(new_device_id: &str) -> Result<Store, OpenError> {
        Store::from_connection(
            Connection::open_in_memory()?,
            Backing::Memory,
            new_device_id,
        )
    }

    fn from_connection(
        mut conn: Connection,
        backing: Backing,
        new_device_id: &str,
    ) -> Result<Store, OpenError> {
        let found: u32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if found > SCHEMA_VERSION {
            return Err(OpenError::Newer {
                found,
                supported: SCHEMA_VERSION,
            });
        }
        let mode: String =
            conn.pragma_update_and_check(None, "journal_mode", "wal", |row| row.get(0))?;
        check_journal_mode(backing, &mode)?;
        migrate::run(&mut conn)?;
        let (device_id, hlc) = init_meta(&mut conn, new_device_id)?;
        Ok(Store {
            inner: Mutex::new(Inner { conn, hlc }),
            device_id,
            #[cfg(any(test, feature = "test-hooks"))]
            hooks: hooks::Hooks::default(),
        })
    }

    /// This device's id, as stored in `meta` (the first one ever passed to `open`).
    pub fn device_id(&self) -> &str {
        &self.device_id
    }

    /// Runs `f` in one read transaction. [`Txn::now_ms`] is 0 here: reads have no write time.
    pub fn read<T>(&self, f: impl FnOnce(&Txn) -> Result<T, StoreError>) -> Result<T, StoreError> {
        #[cfg(any(test, feature = "test-hooks"))]
        self.hooks.before_read()?;
        let mut inner = self.lock();
        let Inner { conn, hlc } = &mut *inner;
        // Reads never tick the clock; the copy only satisfies `Txn`'s shape.
        let mut unused_clock = hlc.clone();
        let tx = conn.transaction_with_behavior(TransactionBehavior::Deferred)?;
        let txn = Txn::new(&tx, 0, &self.device_id, &mut unused_clock);
        f(&txn)
    }

    /// Runs `f` in one write transaction and commits it when `f` returns `Ok`.
    ///
    /// `now_ms` feeds the hybrid logical clock and is what repositories write as `updated_at`.
    /// The clock's last stamp is saved to `meta.hlc_last` in the same transaction. When `f`
    /// returns `Err` or panics, nothing is written and the clock is left as it was.
    pub fn write<T>(
        &self,
        now_ms: u64,
        f: impl FnOnce(&mut Txn) -> Result<T, StoreError>,
    ) -> Result<T, StoreError> {
        #[cfg(any(test, feature = "test-hooks"))]
        self.hooks.before_write()?;
        let mut inner = self.lock();
        let Inner { conn, hlc } = &mut *inner;
        // Ticks go to a copy that replaces the clock only after the commit.
        let mut next_clock = hlc.clone();
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let mut txn = Txn::new(&tx, now_ms, &self.device_id, &mut next_clock);
        let value = f(&mut txn)?;
        if let Some(last) = txn.into_last_stamp() {
            set_meta(&tx, META_HLC_LAST, &last.to_string())?;
        }
        tx.commit()?;
        *hlc = next_clock;
        Ok(value)
    }

    /// A panic inside a closure rolls its transaction back before the guard is released, so
    /// the connection is consistent and a poisoned mutex is safe to reuse.
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Where the database lives, which decides the journal mode it can have.
#[derive(Debug, Clone, Copy)]
pub(crate) enum Backing {
    File,
    Memory,
}

/// SQLite answers `PRAGMA journal_mode = wal` with the mode it actually took. A file must be in
/// WAL (ADR-002); SQLite silently keeps another mode when it cannot switch (a VFS without
/// shared memory, for one). An in-memory database always answers `memory`.
pub(crate) fn check_journal_mode(backing: Backing, mode: &str) -> Result<(), OpenError> {
    let expected = match backing {
        Backing::File => "wal",
        Backing::Memory => "memory",
    };
    if mode.eq_ignore_ascii_case(expected) {
        Ok(())
    } else {
        Err(OpenError::Sqlite(format!(
            "journal_mode is {mode}, expected {expected}"
        )))
    }
}

/// Writes `device_id` and `hlc_last` when absent and returns the stored device id and clock.
fn init_meta(conn: &mut Connection, new_device_id: &str) -> Result<(String, Hlc), OpenError> {
    let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
    tx.execute(
        "INSERT OR IGNORE INTO meta (key, value) VALUES (?1, ?2)",
        (META_DEVICE_ID, new_device_id),
    )?;
    let device_id = get_meta(&tx, META_DEVICE_ID)?
        .ok_or_else(|| OpenError::Sqlite("meta.device_id is missing".to_owned()))?;
    let first_stamp = HlcStamp {
        wall_ms: 0,
        counter: 0,
        device_id: device_id.clone(),
    };
    tx.execute(
        "INSERT OR IGNORE INTO meta (key, value) VALUES (?1, ?2)",
        (META_HLC_LAST, first_stamp.to_string()),
    )?;
    let raw_last = get_meta(&tx, META_HLC_LAST)?
        .ok_or_else(|| OpenError::Sqlite("meta.hlc_last is missing".to_owned()))?;
    let last: HlcStamp = raw_last.parse().map_err(|_| {
        OpenError::Sqlite(format!("meta.hlc_last is not a clock stamp: {raw_last}"))
    })?;
    if last.device_id != device_id {
        return Err(OpenError::Sqlite(format!(
            "meta.hlc_last belongs to device {} but meta.device_id is {device_id}",
            last.device_id
        )));
    }
    tx.commit()?;
    Ok((device_id, Hlc::restore(&last)))
}

/// SQLite integers are signed; a time or duration past `i64::MAX` is refused, never wrapped.
pub(crate) fn sql_int(value: u64) -> Result<i64, StoreError> {
    i64::try_from(value)
        .map_err(|_| StoreError::Sqlite(format!("{value} does not fit an SQLite integer")))
}

pub(crate) fn get_meta(conn: &Connection, key: &str) -> Result<Option<String>, rusqlite::Error> {
    conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |row| {
        row.get(0)
    })
    .optional()
}

fn set_meta(conn: &Connection, key: &str, value: &str) -> Result<(), rusqlite::Error> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        (key, value),
    )?;
    Ok(())
}
