//! Orasenda local storage: SQLite in the sync-ready shape of ADR-002, used as ADR-012 says.
//!
//! One [`Store`] holds one connection behind a mutex. Every access is a closure that runs in one
//! SQLite transaction: [`Store::read`] and [`Store::write`]. Repositories ([`settings`],
//! [`focus_sessions`], [`active_session`]) are functions over the [`Txn`] the closure receives.
//! Syncable repositories log every field they write through [`Txn::log_fields`]; device-only
//! ones never touch `change_log`.
//!
//! The store never reads the clock and never makes ids: the caller passes `now_ms` to every
//! write and the device id to [`Store::open`].

pub mod active_session;
pub mod focus_sessions;
#[cfg(any(test, feature = "test-hooks"))]
mod hooks;
pub mod meta;
mod migrate;
pub mod settings;
mod txn;

#[cfg(any(test, feature = "test-hooks"))]
pub use hooks::WriteGate;
pub use txn::{Entity, Txn};

use orasenda_core::{Hlc, HlcStamp};
use rusqlite::{Connection, ErrorCode, OptionalExtension, TransactionBehavior};
use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};

/// The schema version this build writes, kept only in `PRAGMA user_version` (ADR-012).
pub const SCHEMA_VERSION: u32 = 2;

const META_DEVICE_ID: &str = "device_id";
const META_HLC_LAST: &str = "hlc_last";

/// Why a store could not be opened.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpenError {
    /// The file was written by a newer Orasenda. It is left untouched.
    Newer { found: u32, supported: u32 },
    /// SQLite refused the file or its contents are inconsistent.
    Sqlite(String),
    /// The file could not be opened or created (missing directory, permission denied).
    Io(String),
}

impl std::fmt::Display for OpenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OpenError::Newer { found, supported } => write!(
                f,
                "database schema version {found} is newer than this build supports ({supported})"
            ),
            OpenError::Sqlite(message) => write!(f, "database error: {message}"),
            OpenError::Io(message) => write!(f, "cannot open database file: {message}"),
        }
    }
}

impl std::error::Error for OpenError {}

impl From<rusqlite::Error> for OpenError {
    fn from(err: rusqlite::Error) -> OpenError {
        match err.sqlite_error_code() {
            Some(ErrorCode::CannotOpen | ErrorCode::PermissionDenied) => {
                OpenError::Io(err.to_string())
            }
            _ => OpenError::Sqlite(err.to_string()),
        }
    }
}

/// Why a read or write failed. A failed write has been rolled back.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreError {
    Sqlite(String),
    /// A value did not serialize, or a stored value did not deserialize into the asked type.
    Json(String),
    /// The store can no longer be used.
    Closed,
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::Sqlite(message) => write!(f, "database error: {message}"),
            StoreError::Json(message) => write!(f, "stored value error: {message}"),
            StoreError::Closed => f.write_str("the store is closed"),
        }
    }
}

impl std::error::Error for StoreError {}

impl From<rusqlite::Error> for StoreError {
    fn from(err: rusqlite::Error) -> StoreError {
        StoreError::Sqlite(err.to_string())
    }
}

impl From<serde_json::Error> for StoreError {
    fn from(err: serde_json::Error) -> StoreError {
        StoreError::Json(err.to_string())
    }
}

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
    hooks: hooks::Hooks,
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
enum Backing {
    File,
    Memory,
}

/// SQLite answers `PRAGMA journal_mode = wal` with the mode it actually took. A file must be in
/// WAL (ADR-002); SQLite silently keeps another mode when it cannot switch (a VFS without
/// shared memory, for one). An in-memory database always answers `memory`.
fn check_journal_mode(backing: Backing, mode: &str) -> Result<(), OpenError> {
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

fn get_meta(conn: &Connection, key: &str) -> Result<Option<String>, rusqlite::Error> {
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

#[cfg(test)]
pub(crate) mod test_support {
    //! A temporary directory per test, removed on drop, and raw-SQL helpers for assertions.

    use rusqlite::Connection;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU32, Ordering};

    static NEXT: AtomicU32 = AtomicU32::new(0);

    pub struct TempDir(PathBuf);

    impl TempDir {
        pub fn new(name: &str) -> TempDir {
            let unique = format!(
                "orasenda-store-{}-{}-{name}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            );
            let dir = std::env::temp_dir().join(unique);
            std::fs::create_dir_all(&dir).expect("temp dir is creatable");
            TempDir(dir)
        }

        pub fn path(&self) -> &Path {
            &self.0
        }

        pub fn db(&self) -> PathBuf {
            self.0.join("orasenda.sqlite")
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            // Best effort: a leftover temp dir must not fail a test.
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    pub fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |row| row.get(0))
            .expect("count query runs")
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::{TempDir, count};
    use super::*;
    use std::sync::Arc;

    const DEVICE: &str = "device-a";

    fn raw(path: &Path) -> Connection {
        Connection::open(path).expect("raw connection opens")
    }

    fn meta(conn: &Connection, key: &str) -> Option<String> {
        get_meta(conn, key).expect("meta query runs")
    }

    fn columns(conn: &Connection, table: &str) -> Vec<String> {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT name FROM pragma_table_info('{table}') ORDER BY cid"
            ))
            .expect("table_info prepares");
        stmt.query_map([], |row| row.get(0))
            .expect("table_info runs")
            .collect::<Result<_, _>>()
            .expect("column names read")
    }

    #[test]
    fn journal_mode_other_than_wal_is_refused_for_a_file() {
        assert_eq!(check_journal_mode(Backing::File, "wal"), Ok(()));
        assert_eq!(check_journal_mode(Backing::Memory, "memory"), Ok(()));
        assert_eq!(
            check_journal_mode(Backing::File, "delete"),
            Err(OpenError::Sqlite(
                "journal_mode is delete, expected wal".into()
            ))
        );
        assert_eq!(
            check_journal_mode(Backing::Memory, "delete"),
            Err(OpenError::Sqlite(
                "journal_mode is delete, expected memory".into()
            ))
        );
    }

    #[test]
    fn store_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<Store>();
        assert_send_sync::<Arc<Store>>();
    }

    #[test]
    fn fresh_file_reaches_v2_without_review_marker() {
        let dir = TempDir::new("fresh");
        let store = Store::open(&dir.db(), DEVICE).expect("opens");
        assert_eq!(store.device_id(), DEVICE);
        drop(store);

        let conn = raw(&dir.db());
        let version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("user_version");
        assert_eq!(version, SCHEMA_VERSION);
        assert_eq!(version, 2);
        assert_eq!(meta(&conn, "notify_review"), None);
        let mode: String = conn
            .pragma_query_value(None, "journal_mode", |row| row.get(0))
            .expect("journal_mode");
        assert_eq!(mode, "wal");
        assert_eq!(meta(&conn, "device_id").as_deref(), Some(DEVICE));
        let hlc_last: HlcStamp = meta(&conn, "hlc_last")
            .expect("hlc_last is written")
            .parse()
            .expect("hlc_last is a stamp");
        assert_eq!(hlc_last.device_id, DEVICE);
        assert_eq!(
            meta(&conn, "schema_version"),
            None,
            "ADR-012: user_version only"
        );

        assert_eq!(columns(&conn, "meta"), ["key", "value"]);
        assert_eq!(
            columns(&conn, "change_log"),
            [
                "seq",
                "hlc",
                "device_id",
                "entity",
                "entity_id",
                "field",
                "value",
                "synced_at"
            ]
        );
        assert_eq!(columns(&conn, "setting"), ["key", "value", "updated_at"]);
        assert_eq!(
            columns(&conn, "focus_session"),
            [
                "id",
                "created_at",
                "updated_at",
                "deleted_at",
                "preset",
                "phase",
                "planned_ms",
                "started_at",
                "ended_at",
                "paused_total_ms",
                "focused_ms",
                "end_reason",
                "extensions",
                "intent"
            ]
        );
        assert_eq!(
            columns(&conn, "active_session"),
            ["singleton", "snapshot", "updated_at"]
        );
        assert_eq!(
            count(
                &conn,
                "SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            ),
            5
        );
    }

    #[test]
    fn reopen_is_idempotent_and_keeps_device_id() {
        let dir = TempDir::new("reopen");
        let first = Store::open(&dir.db(), DEVICE).expect("opens");
        first
            .write(1_000, |txn| settings::set(txn, "k", &1))
            .expect("writes");
        drop(first);

        let second = Store::open(&dir.db(), "device-b").expect("reopens");
        assert_eq!(second.device_id(), DEVICE);
        let value: Option<i32> = second.read(|txn| settings::get(txn, "k")).expect("reads");
        assert_eq!(value, Some(1));
        drop(second);

        let third = Store::open(&dir.db(), "device-c").expect("reopens again");
        assert_eq!(third.device_id(), DEVICE);
        drop(third);
        let conn = raw(&dir.db());
        let version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("user_version");
        assert_eq!(version, SCHEMA_VERSION);
        assert_eq!(count(&conn, "SELECT count(*) FROM meta"), 2);
    }

    fn v1_file(dir: &TempDir) {
        let conn = raw(&dir.db());
        conn.execute_batch(include_str!("../migrations/0001_init.sql"))
            .expect("0001 applies");
        conn.pragma_update(None, "user_version", 1).expect("v1");
        conn.execute(
            "INSERT INTO meta (key, value) VALUES ('device_id', 'device-a')",
            [],
        )
        .expect("device_id");
    }

    fn user_version(path: &Path) -> u32 {
        raw(path)
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("user_version")
    }

    #[test]
    fn v1_file_with_device_id_gets_review_marker() {
        let dir = TempDir::new("v1marker");
        v1_file(&dir);
        drop(Store::open(&dir.db(), "other").expect("opens"));
        assert_eq!(user_version(&dir.db()), 2);
        let conn = raw(&dir.db());
        assert_eq!(meta(&conn, "notify_review").as_deref(), Some("pending"));
        assert_eq!(meta(&conn, "device_id").as_deref(), Some("device-a"));
    }

    #[test]
    fn meta_get_and_remove_write_no_change_log() {
        let dir = TempDir::new("metalog");
        v1_file(&dir);
        let store = Store::open(&dir.db(), "other").expect("opens");
        let got = store
            .read(|txn| meta::get(txn, "notify_review"))
            .expect("reads");
        assert_eq!(got.as_deref(), Some("pending"));
        store
            .write(1_000, |txn| meta::remove(txn, "notify_review"))
            .expect("removes");
        store
            .write(2_000, |txn| meta::remove(txn, "notify_review"))
            .expect("removing an absent key is fine");
        let got = store
            .read(|txn| meta::get(txn, "notify_review"))
            .expect("reads");
        assert_eq!(got, None);
        drop(store);
        assert_eq!(count(&raw(&dir.db()), "SELECT count(*) FROM change_log"), 0);
    }

    #[test]
    fn v2_reopen_after_review_keeps_no_marker() {
        let dir = TempDir::new("v2reopen");
        v1_file(&dir);
        let store = Store::open(&dir.db(), "other").expect("opens");
        store
            .write(1_000, |txn| meta::remove(txn, "notify_review"))
            .expect("removes");
        drop(store);
        drop(Store::open(&dir.db(), "other").expect("reopens"));
        assert_eq!(user_version(&dir.db()), 2);
        assert_eq!(meta(&raw(&dir.db()), "notify_review"), None);
    }

    #[test]
    fn newer_user_version_is_refused_and_untouched() {
        let dir = TempDir::new("newer");
        let newer = SCHEMA_VERSION + 1;
        {
            let conn = raw(&dir.db());
            conn.execute_batch("CREATE TABLE future (x INTEGER)")
                .expect("creates");
            conn.pragma_update(None, "user_version", newer)
                .expect("sets user_version");
        }
        let before = std::fs::read(dir.db()).expect("reads file");

        let result = Store::open(&dir.db(), DEVICE);
        assert_eq!(
            result.err(),
            Some(OpenError::Newer {
                found: newer,
                supported: SCHEMA_VERSION
            })
        );

        assert_eq!(std::fs::read(dir.db()).expect("reads file"), before);
        let entries: Vec<_> = std::fs::read_dir(dir.path())
            .expect("lists dir")
            .map(|entry| entry.expect("entry").file_name())
            .collect();
        assert_eq!(entries, [std::ffi::OsString::from("orasenda.sqlite")]);
    }

    #[test]
    fn open_without_parent_dir_fails_without_creating_it() {
        let dir = TempDir::new("noparent");
        let missing = dir.path().join("missing");
        let result = Store::open(&missing.join("orasenda.sqlite"), DEVICE);
        assert!(
            matches!(result, Err(OpenError::Io(_) | OpenError::Sqlite(_))),
            "{:?}",
            result.err()
        );
        assert!(!missing.exists());
    }

    #[test]
    fn failed_closure_rolls_back_previous_state_intact() {
        let store = Store::open_in_memory(DEVICE).expect("opens");
        store
            .write(1_000, |txn| settings::set(txn, "k", &1))
            .expect("writes");
        let hlc_before = store
            .read(|txn| Ok(get_meta(txn.conn(), "hlc_last")?))
            .expect("reads");

        let result: Result<(), StoreError> = store.write(2_000, |txn| {
            settings::set(txn, "k", &2)?;
            active_session::put(txn, &"live")?;
            Err(StoreError::Json("refused by the caller".into()))
        });
        assert_eq!(
            result,
            Err(StoreError::Json("refused by the caller".into()))
        );

        store
            .read(|txn| {
                assert_eq!(settings::get::<i32>(txn, "k")?, Some(1));
                assert_eq!(active_session::get::<String>(txn)?, None);
                assert_eq!(count(txn.conn(), "SELECT count(*) FROM change_log"), 1);
                assert_eq!(get_meta(txn.conn(), "hlc_last")?, hlc_before);
                Ok(())
            })
            .expect("reads");

        // The rolled-back stamps were never handed out: the next one follows the first write's.
        store
            .write(1_000, |txn| settings::set(txn, "k", &3))
            .expect("writes");
        let stamps: Vec<String> = store
            .read(|txn| {
                let mut stmt = txn
                    .conn()
                    .prepare("SELECT hlc FROM change_log ORDER BY seq")?;
                let rows = stmt.query_map([], |row| row.get(0))?;
                Ok(rows.collect::<Result<_, _>>()?)
            })
            .expect("reads");
        assert_eq!(
            stamps,
            [
                format!("0000000001000-00000-{DEVICE}"),
                format!("0000000001000-00001-{DEVICE}")
            ]
        );
    }

    #[test]
    fn dropped_connection_without_commit_leaves_previous_state() {
        let dir = TempDir::new("crash");
        let survivor = Store::open(&dir.db(), DEVICE).expect("opens");
        survivor
            .write(1_000, |txn| settings::set(txn, "k", &1))
            .expect("writes");
        let hlc_before = meta(&raw(&dir.db()), "hlc_last");

        let crashing = Store::open(&dir.db(), DEVICE).expect("opens a second store");
        let crashed = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            crashing.write::<()>(2_000, |txn| {
                settings::set(txn, "k", &2)?;
                active_session::put(txn, &"live")?;
                panic!("simulated crash before commit");
            })
        }));
        assert!(crashed.is_err());

        // The poisoned store recovers its mutex and sees the old state.
        let seen: Option<i32> = crashing.read(|txn| settings::get(txn, "k")).expect("reads");
        assert_eq!(seen, Some(1));
        drop(crashing);

        survivor
            .read(|txn| {
                assert_eq!(settings::get::<i32>(txn, "k")?, Some(1));
                assert_eq!(active_session::get::<String>(txn)?, None);
                assert_eq!(count(txn.conn(), "SELECT count(*) FROM change_log"), 1);
                Ok(())
            })
            .expect("reads");
        drop(survivor);
        assert_eq!(meta(&raw(&dir.db()), "hlc_last"), hlc_before);
    }

    #[test]
    fn hlc_last_persists_across_reopen() {
        let dir = TempDir::new("hlc");
        let store = Store::open(&dir.db(), DEVICE).expect("opens");
        store
            .write(5_000, |txn| {
                settings::set(txn, "a", &1)?;
                settings::set(txn, "b", &2)
            })
            .expect("writes");
        drop(store);
        assert_eq!(
            meta(&raw(&dir.db()), "hlc_last").as_deref(),
            Some(format!("0000000005000-00001-{DEVICE}").as_str())
        );

        // A wall clock that went backwards still continues after the saved stamp.
        let store = Store::open(&dir.db(), DEVICE).expect("reopens");
        store
            .write(1_000, |txn| settings::set(txn, "a", &3))
            .expect("writes");
        drop(store);
        let conn = raw(&dir.db());
        let latest: String = conn
            .query_row(
                "SELECT hlc FROM change_log ORDER BY seq DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .expect("reads");
        assert_eq!(latest, format!("0000000005000-00002-{DEVICE}"));
        assert_eq!(meta(&conn, "hlc_last"), Some(latest));
    }

    #[test]
    fn hlc_last_device_id_must_match_meta_device_id() {
        let dir = TempDir::new("hlcdevice");
        drop(Store::open(&dir.db(), DEVICE).expect("opens"));
        raw(&dir.db())
            .execute(
                "UPDATE meta SET value = '0000000005000-00000-someone-else' WHERE key = 'hlc_last'",
                [],
            )
            .expect("tampers");

        let result = Store::open(&dir.db(), DEVICE);
        match result {
            Err(OpenError::Sqlite(message)) => {
                assert!(message.contains("hlc_last"), "{message}");
                assert!(message.contains("someone-else"), "{message}");
            }
            other => panic!("expected OpenError::Sqlite, got {:?}", other.err()),
        }
    }

    #[test]
    fn open_in_memory_works_for_app_tests() {
        let store = Store::open_in_memory(DEVICE).expect("opens");
        assert_eq!(store.device_id(), DEVICE);
        store
            .write(1_000, |txn| {
                settings::set(txn, "notify.session_end", &true)?;
                active_session::put(txn, &serde_json::json!({ "state": "running" }))
            })
            .expect("writes");
        let (flag, live) = store
            .read(|txn| {
                Ok((
                    settings::get::<bool>(txn, "notify.session_end")?,
                    active_session::get::<serde_json::Value>(txn)?,
                ))
            })
            .expect("reads");
        assert_eq!(flag, Some(true));
        assert_eq!(live, Some(serde_json::json!({ "state": "running" })));
        let version: u32 = store
            .read(|txn| {
                Ok(txn
                    .conn()
                    .pragma_query_value(None, "user_version", |row| row.get(0))?)
            })
            .expect("reads");
        assert_eq!(version, SCHEMA_VERSION);
    }
}
