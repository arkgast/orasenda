//! Settings, keyed by name. **Syncable**: every `set` logs the value to `change_log` with
//! `entity = "setting"` and `entity_id` = the key (ADR-012). A setting is reset by writing its
//! default, never deleted.

use crate::{Entity, StoreError, Txn, sql_int};
use rusqlite::OptionalExtension;
use serde::Serialize;
use serde::de::DeserializeOwned;

/// The stored value of `key`, or `None` when it was never set.
pub fn get<T: DeserializeOwned>(txn: &Txn, key: &str) -> Result<Option<T>, StoreError> {
    let stored: Option<String> = txn
        .conn()
        .query_row("SELECT value FROM setting WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .optional()?;
    Ok(stored.map(|json| serde_json::from_str(&json)).transpose()?)
}

/// Stores `value` under `key` with `updated_at = txn.now_ms()` and logs it.
pub fn set<T: Serialize>(txn: &mut Txn, key: &str, value: &T) -> Result<(), StoreError> {
    let json = serde_json::to_value(value)?;
    txn.conn().execute(
        "INSERT INTO setting (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        (key, serde_json::to_string(&json)?, sql_int(txn.now_ms())?),
    )?;
    txn.log_fields(Entity::Setting, key, &[("value", json)])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Store;
    use crate::test_support::count;
    use orasenda_core::{CustomSpec, HlcStamp, Preset};

    const DEVICE: &str = "device-a";

    #[derive(Debug, PartialEq)]
    struct LogRow {
        hlc: String,
        device_id: String,
        entity: String,
        entity_id: String,
        field: String,
        value: String,
        synced_at: Option<i64>,
    }

    fn log_rows(store: &Store) -> Vec<LogRow> {
        store
            .read(|txn| {
                let mut stmt = txn.conn().prepare(
                    "SELECT hlc, device_id, entity, entity_id, field, value, synced_at
                     FROM change_log ORDER BY seq",
                )?;
                let rows = stmt.query_map([], |row| {
                    Ok(LogRow {
                        hlc: row.get(0)?,
                        device_id: row.get(1)?,
                        entity: row.get(2)?,
                        entity_id: row.get(3)?,
                        field: row.get(4)?,
                        value: row.get(5)?,
                        synced_at: row.get(6)?,
                    })
                })?;
                Ok(rows.collect::<Result<_, _>>()?)
            })
            .expect("reads change_log")
    }

    fn setting_row(store: &Store, key: &str) -> (String, i64) {
        store
            .read(|txn| {
                Ok(txn.conn().query_row(
                    "SELECT value, updated_at FROM setting WHERE key = ?1",
                    [key],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )?)
            })
            .expect("reads setting")
    }

    #[test]
    fn settings_set_writes_one_change_log_row_per_field() {
        let store = Store::open_in_memory(DEVICE).expect("opens");
        let custom = CustomSpec {
            focus_min: 45,
            break_min: 10,
        };
        store
            .write(1_000, |txn| set(txn, "timer.custom", &custom))
            .expect("writes");

        let rows = log_rows(&store);
        assert_eq!(rows.len(), 1);
        let row = &rows[0];
        assert_eq!(row.entity, "setting");
        assert_eq!(row.entity_id, "timer.custom");
        assert_eq!(row.field, "value");
        let logged: serde_json::Value = serde_json::from_str(&row.value).expect("value is JSON");
        assert_eq!(logged, serde_json::to_value(custom).expect("json"));
        assert_eq!(row.device_id, DEVICE);
        assert_eq!(row.synced_at, None);
        assert_eq!(row.hlc, format!("0000000001000-00000-{DEVICE}"));

        let read: Option<CustomSpec> = store.read(|txn| get(txn, "timer.custom")).expect("reads");
        assert_eq!(read, Some(custom));
    }

    #[test]
    fn settings_set_twice_updates_row_and_appends_log() {
        let store = Store::open_in_memory(DEVICE).expect("opens");
        store
            .write(1_000, |txn| set(txn, "timer.preset", &Preset::Classic))
            .expect("writes");
        store
            .write(2_000, |txn| set(txn, "timer.preset", &Preset::DeepBlock))
            .expect("writes");

        let preset: Option<Preset> = store.read(|txn| get(txn, "timer.preset")).expect("reads");
        assert_eq!(preset, Some(Preset::DeepBlock));
        assert_eq!(
            setting_row(&store, "timer.preset"),
            ("\"deep_block\"".into(), 2_000)
        );
        store
            .read(|txn| {
                assert_eq!(count(txn.conn(), "SELECT count(*) FROM setting"), 1);
                Ok(())
            })
            .expect("reads");
        let values: Vec<String> = log_rows(&store).into_iter().map(|row| row.value).collect();
        assert_eq!(values, ["\"classic\"", "\"deep_block\""]);
    }

    #[test]
    fn settings_get_missing_is_none() {
        let store = Store::open_in_memory(DEVICE).expect("opens");
        let value: Option<bool> = store
            .read(|txn| get(txn, "notify.session_end"))
            .expect("reads");
        assert_eq!(value, None);
    }

    #[test]
    fn settings_get_with_wrong_type_is_a_json_error() {
        let store = Store::open_in_memory(DEVICE).expect("opens");
        store
            .write(1_000, |txn| set(txn, "notify.session_end", &true))
            .expect("writes");
        let result = store.read(|txn| get::<Preset>(txn, "notify.session_end"));
        assert!(matches!(result, Err(StoreError::Json(_))), "{result:?}");
    }

    #[test]
    fn settings_updated_at_is_write_now_ms() {
        let store = Store::open_in_memory(DEVICE).expect("opens");
        store
            .write(1_794_009_600_123, |txn| {
                assert_eq!(txn.now_ms(), 1_794_009_600_123);
                set(txn, "notify.session_end", &false)
            })
            .expect("writes");
        assert_eq!(
            setting_row(&store, "notify.session_end"),
            ("false".into(), 1_794_009_600_123)
        );
    }

    #[test]
    fn change_log_hlc_is_increasing_and_carries_device_id() {
        let store = Store::open_in_memory(DEVICE).expect("opens");
        // Equal and backward wall times must still give strictly increasing stamps.
        for now_ms in [5_000, 5_000, 4_000, 6_000] {
            store
                .write(now_ms, |txn| {
                    set(txn, "a", &now_ms)?;
                    set(txn, "b", &now_ms)
                })
                .expect("writes");
        }
        let rows = log_rows(&store);
        assert_eq!(rows.len(), 8);
        let stamps: Vec<HlcStamp> = rows
            .iter()
            .map(|row| row.hlc.parse().expect("hlc is a stamp"))
            .collect();
        for (row, stamp) in rows.iter().zip(&stamps) {
            assert_eq!(row.device_id, DEVICE);
            assert_eq!(stamp.device_id, DEVICE);
        }
        for pair in rows.windows(2) {
            assert!(
                pair[0].hlc < pair[1].hlc,
                "{} !< {}",
                pair[0].hlc,
                pair[1].hlc
            );
        }
        assert_eq!(
            stamps[5].wall_ms, 5_000,
            "a backward wall time keeps the clock's wall"
        );
        assert_eq!((stamps[6].wall_ms, stamps[6].counter), (6_000, 0));
    }
}
