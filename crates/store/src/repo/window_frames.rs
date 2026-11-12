//! Where a window was last left, per window and display. **Device-only**: a window position
//! means nothing on another machine, so this module never writes `change_log` (ADR-012).
//!
//! Coordinates are integer points relative to the display frame's top-left. There is no id,
//! `created_at` or tombstone, like `active_session`.

use crate::{StoreError, Txn};

/// A stored frame: points from the display frame's top-left.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct StoredFrame {
    pub x: i64,
    pub y: i64,
    pub width: i64,
    pub height: i64,
}

/// The frame stored for `window` on `display`, or `None`.
pub fn get(_txn: &Txn, _window: &str, _display: &str) -> Result<Option<StoredFrame>, StoreError> {
    todo!()
}

/// The frame of `window` on the connected display (one of `displays`) written most recently,
/// with that display's key. On equal times the earlier display in `displays` wins. `None` when
/// no listed display has a frame.
pub fn latest(
    _txn: &Txn,
    _window: &str,
    _displays: &[&str],
) -> Result<Option<(String, StoredFrame)>, StoreError> {
    todo!()
}

/// Replaces the frame of `window` on `display`, with `updated_at = now_ms`. Takes `&Txn`
/// because it logs nothing.
pub fn put(
    _txn: &Txn,
    _window: &str,
    _display: &str,
    _frame: StoredFrame,
    _now_ms: u64,
) -> Result<(), StoreError> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Store;
    use crate::test_support::count;

    const FRAME: StoredFrame = StoredFrame {
        x: 1040,
        y: 24,
        width: 280,
        height: 64,
    };

    fn store() -> Store {
        Store::open_in_memory("device-a").expect("opens")
    }

    /// The schema just before this repository's migration, built from the `MIGRATIONS` list
    /// without naming a version.
    #[test]
    fn window_frame_migrates_from_previous_version() {
        let own = include_str!("../../migrations/0003_window_frame.sql");
        let (index, _) = crate::migrate::MIGRATIONS
            .iter()
            .enumerate()
            .find(|(_, (_, sql))| *sql == own)
            .expect("the migration is in the list");
        let mut conn = rusqlite::Connection::open_in_memory().expect("opens");
        for (_, sql) in &crate::migrate::MIGRATIONS[..index] {
            conn.execute_batch(sql)
                .expect("an earlier migration applies");
        }
        let before = index
            .checked_sub(1)
            .map_or(0, |earlier| crate::migrate::MIGRATIONS[earlier].0);
        conn.pragma_update(None, "user_version", before)
            .expect("sets the version");
        let table: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_schema WHERE name = 'window_frame'",
                [],
                |row| row.get(0),
            )
            .expect("queries");
        assert_eq!(table, 0, "the table is new");

        crate::migrate::run(&mut conn).expect("migrates");

        let columns: Vec<String> = conn
            .prepare("SELECT name FROM pragma_table_info('window_frame') ORDER BY cid")
            .expect("prepares")
            .query_map([], |row| row.get(0))
            .expect("runs")
            .collect::<Result<_, _>>()
            .expect("reads");
        assert_eq!(
            columns,
            [
                "window",
                "display",
                "x",
                "y",
                "width",
                "height",
                "updated_at"
            ]
        );
        let key: Vec<String> = conn
            .prepare("SELECT name FROM pragma_table_info('window_frame') WHERE pk > 0 ORDER BY pk")
            .expect("prepares")
            .query_map([], |row| row.get(0))
            .expect("runs")
            .collect::<Result<_, _>>()
            .expect("reads");
        assert_eq!(key, ["window", "display"]);
        let version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("user_version");
        assert_eq!(version, crate::SCHEMA_VERSION);
    }

    #[test]
    fn window_frame_put_get_replaces() {
        let store = store();
        let moved = StoredFrame { x: 5, ..FRAME };
        store
            .write(1_000, |txn| put(txn, "floater", "d1", FRAME, txn.now_ms()))
            .expect("puts");
        store
            .write(2_000, |txn| put(txn, "floater", "d1", moved, txn.now_ms()))
            .expect("replaces");
        let (first, other, rows) = store
            .read(|txn| {
                Ok((
                    get(txn, "floater", "d1")?,
                    get(txn, "floater", "d2")?,
                    count(txn.conn(), "SELECT count(*) FROM window_frame"),
                ))
            })
            .expect("reads");
        assert_eq!(first, Some(moved));
        assert_eq!(other, None);
        assert_eq!(rows, 1);
    }

    #[test]
    fn window_frame_put_writes_no_change_log() {
        let store = store();
        let hlc_before = store
            .read(|txn| Ok(crate::get_meta(txn.conn(), "hlc_last")?))
            .expect("reads");
        store
            .write(1_000, |txn| put(txn, "floater", "d1", FRAME, txn.now_ms()))
            .expect("puts");
        store
            .read(|txn| {
                assert_eq!(count(txn.conn(), "SELECT count(*) FROM change_log"), 0);
                assert_eq!(crate::get_meta(txn.conn(), "hlc_last")?, hlc_before);
                Ok(())
            })
            .expect("reads");
    }

    #[test]
    fn window_frame_latest_newest_connected() {
        let store = store();
        let other = StoredFrame { x: 9, ..FRAME };
        store
            .write(1_000, |txn| {
                put(txn, "floater", "old", FRAME, txn.now_ms())?;
                put(txn, "floater", "mid", other, 2_000)?;
                // The newest of all, but not connected.
                put(txn, "floater", "gone", FRAME, 9_000)?;
                // Another window never counts.
                put(txn, "other", "old", FRAME, 8_000)
            })
            .expect("puts");
        let newest = store
            .read(|txn| latest(txn, "floater", &["old", "mid", "new"]))
            .expect("reads");
        assert_eq!(newest, Some(("mid".to_owned(), other)));
        let none = store
            .read(|txn| latest(txn, "floater", &["unknown", "also-unknown"]))
            .expect("reads");
        assert_eq!(none, None);
        let empty = store
            .read(|txn| latest(txn, "floater", &[]))
            .expect("reads");
        assert_eq!(empty, None);
    }
}
