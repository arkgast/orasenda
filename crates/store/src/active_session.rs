//! The live session, one row at most. **Device-only**: a session runs on one device at a time,
//! so this module never writes `change_log` (ADR-012).

use crate::{StoreError, Txn, sql_int};
use rusqlite::OptionalExtension;
use serde::Serialize;
use serde::de::DeserializeOwned;

/// The stored snapshot, or `None` when no session is live.
pub fn get<T: DeserializeOwned>(txn: &Txn) -> Result<Option<T>, StoreError> {
    let stored: Option<String> = txn
        .conn()
        .query_row(
            "SELECT snapshot FROM active_session WHERE singleton = 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(stored.map(|json| serde_json::from_str(&json)).transpose()?)
}

/// Replaces the snapshot, with `updated_at = txn.now_ms()`.
pub fn put<T: Serialize>(txn: &mut Txn, snapshot: &T) -> Result<(), StoreError> {
    txn.conn().execute(
        "INSERT INTO active_session (singleton, snapshot, updated_at) VALUES (1, ?1, ?2)
         ON CONFLICT (singleton) DO UPDATE
         SET snapshot = excluded.snapshot, updated_at = excluded.updated_at",
        (serde_json::to_string(snapshot)?, sql_int(txn.now_ms())?),
    )?;
    Ok(())
}

/// Removes the snapshot. Clearing an empty row is not an error.
pub fn clear(txn: &mut Txn) -> Result<(), StoreError> {
    txn.conn()
        .execute("DELETE FROM active_session WHERE singleton = 1", [])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Store;
    use crate::test_support::count;
    use serde::Deserialize;

    #[derive(Debug, PartialEq, Serialize, Deserialize)]
    struct Snapshot {
        id: String,
        remaining_ms: u64,
    }

    #[test]
    fn active_session_put_get_clear() {
        let store = Store::open_in_memory("device-a").expect("opens");
        let empty: Option<Snapshot> = store.read(get).expect("reads");
        assert_eq!(empty, None);

        let first = Snapshot {
            id: "s1".into(),
            remaining_ms: 1_500_000,
        };
        let second = Snapshot {
            id: "s1".into(),
            remaining_ms: 900_000,
        };
        store.write(1_000, |txn| put(txn, &first)).expect("puts");
        store
            .write(2_000, |txn| put(txn, &second))
            .expect("replaces");
        let (live, rows, updated_at) = store
            .read(|txn| {
                Ok((
                    get::<Snapshot>(txn)?,
                    count(txn.conn(), "SELECT count(*) FROM active_session"),
                    count(txn.conn(), "SELECT updated_at FROM active_session"),
                ))
            })
            .expect("reads");
        assert_eq!(live, Some(second));
        assert_eq!(rows, 1);
        assert_eq!(updated_at, 2_000);

        store.write(3_000, clear).expect("clears");
        let cleared: Option<Snapshot> = store.read(get).expect("reads");
        assert_eq!(cleared, None);
        store
            .write(4_000, clear)
            .expect("clearing an empty row is fine");
    }

    #[test]
    fn active_session_never_writes_change_log() {
        let store = Store::open_in_memory("device-a").expect("opens");
        let hlc_before = store
            .read(|txn| Ok(crate::get_meta(txn.conn(), "hlc_last")?))
            .expect("reads");
        store
            .write(1_000, |txn| {
                put(txn, &serde_json::json!({ "state": "running" }))
            })
            .expect("puts");
        store
            .write(2_000, |txn| {
                put(txn, &serde_json::json!({ "state": "paused" }))
            })
            .expect("puts");
        store.write(3_000, clear).expect("clears");
        store
            .read(|txn| {
                assert_eq!(count(txn.conn(), "SELECT count(*) FROM change_log"), 0);
                assert_eq!(crate::get_meta(txn.conn(), "hlc_last")?, hlc_before);
                Ok(())
            })
            .expect("reads");
    }
}
