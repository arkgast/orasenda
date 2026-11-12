//! Finished focus sessions. **Syncable and append-only**: a row is inserted once, when the
//! session ends, and never updated (ADR-002).

use crate::{Entity, StoreError, Txn, sql_int};
use orasenda_core::{SessionPreset, SessionRecord};
use serde::Serialize;
use serde_json::Value;

/// Inserts `record` with its own times (`created_at` and `updated_at` are `ended_ms`, not the
/// write time, so a late insert after a relaunch records the fact as it happened) and logs
/// every synced column. A second insert with the same id fails.
pub fn insert(txn: &mut Txn, record: &SessionRecord) -> Result<(), StoreError> {
    let (preset, snapshot) = match &record.preset {
        SessionPreset::Quick => ("quick", None),
        SessionPreset::Library {
            id,
            name,
            focus_min,
            break_min,
            long_break_min,
            rounds,
        } => ("library", Some((id, name, focus_min, break_min, long_break_min, rounds))),
    };
    let phase = text(&record.phase)?;
    let end_reason = text(&record.end_reason)?;
    txn.conn().execute(
        "INSERT INTO focus_session (id, created_at, updated_at, deleted_at, preset, phase,
             planned_ms, started_at, ended_at, paused_total_ms, focused_ms, end_reason,
             extensions, intent, preset_id, preset_name, focus_min, break_min, long_break_min,
             rounds)
         VALUES (?1, ?2, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL,
             ?12, ?13, ?14, ?15, ?16, ?17)",
        rusqlite::params![
            record.id.0,
            sql_int(record.ended_ms)?,
            preset,
            phase,
            sql_int(record.planned_ms)?,
            sql_int(record.started_ms)?,
            sql_int(record.ended_ms)?,
            sql_int(record.paused_total_ms)?,
            sql_int(record.focused_ms)?,
            end_reason,
            record.extensions,
            snapshot.map(|s| s.0.0.clone()),
            snapshot.map(|s| s.1.clone()),
            snapshot.map(|s| *s.2),
            snapshot.map(|s| *s.3),
            snapshot.map(|s| *s.4),
            snapshot.map(|s| *s.5),
        ],
    )?;
    let mut fields = vec![
        ("preset", Value::from(preset)),
        ("phase", Value::from(phase)),
        ("planned_ms", Value::from(record.planned_ms)),
        ("started_at", Value::from(record.started_ms)),
        ("ended_at", Value::from(record.ended_ms)),
        ("paused_total_ms", Value::from(record.paused_total_ms)),
        ("focused_ms", Value::from(record.focused_ms)),
        ("end_reason", Value::from(end_reason)),
        ("extensions", Value::from(record.extensions)),
    ];
    if let Some((id, name, focus_min, break_min, long_break_min, rounds)) = snapshot {
        fields.extend([
            ("preset_id", Value::from(id.0.clone())),
            ("preset_name", Value::from(name.clone())),
            ("focus_min", Value::from(*focus_min)),
            ("break_min", Value::from(*break_min)),
            ("long_break_min", Value::from(*long_break_min)),
            ("rounds", Value::from(*rounds)),
        ]);
    }
    txn.log_fields(Entity::FocusSession, &record.id.0, &fields)
}

/// The serde name of a unit enum (`Phase::Focus` is `"focus"`), so the TEXT column and the
/// logged JSON spell it the same way.
fn text<T: Serialize>(value: &T) -> Result<String, StoreError> {
    match serde_json::to_value(value)? {
        Value::String(name) => Ok(name),
        other => Err(StoreError::Json(format!("expected a string, got {other}"))),
    }
}

/// A finished session as the day's history reads it: just the columns the cadence needs.
/// Text columns stay text, so an old row (`fifty_ten`) reads like any other.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionRow {
    pub id: String,
    pub preset: String,
    pub phase: String,
    pub break_kind: Option<String>,
    pub started_ms: u64,
    pub ended_ms: u64,
    pub focused_ms: u64,
    pub end_reason: String,
}

/// The non-deleted sessions that started in `from_ms..to_ms`, in start order.
pub fn started_between(txn: &Txn, from_ms: u64, to_ms: u64) -> Result<Vec<SessionRow>, StoreError> {
    let mut stmt = txn.conn().prepare(
        "SELECT id, preset, phase, break_kind, started_at, ended_at, focused_ms, end_reason
         FROM focus_session
         WHERE deleted_at IS NULL AND started_at >= ?1 AND started_at < ?2
         ORDER BY started_at, ended_at, id",
    )?;
    let rows = stmt.query_map((sql_int(from_ms)?, sql_int(to_ms)?), |row| {
        let ms = |index| {
            row.get::<_, i64>(index).and_then(|v| {
                u64::try_from(v).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(index, v))
            })
        };
        Ok(SessionRow {
            id: row.get(0)?,
            preset: row.get(1)?,
            phase: row.get(2)?,
            break_kind: row.get(3)?,
            started_ms: ms(4)?,
            ended_ms: ms(5)?,
            focused_ms: ms(6)?,
            end_reason: row.get(7)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Store;
    use crate::test_support::count;
    use orasenda_core::{EndReason, Phase, PresetId, SessionId};

    fn record(id: &str) -> SessionRecord {
        SessionRecord {
            id: SessionId(id.into()),
            preset: SessionPreset::Library {
                id: PresetId("0193-preset".into()),
                name: "50/10".into(),
                focus_min: 50,
                break_min: 10,
                long_break_min: 20,
                rounds: 4,
            },
            phase: Phase::Focus,
            planned_ms: 3_000_000,
            started_ms: 1_794_009_600_000,
            ended_ms: 1_794_012_700_000,
            paused_total_ms: 100_000,
            focused_ms: 3_000_000,
            end_reason: EndReason::Completed,
            extensions: 2,
        }
    }

    #[test]
    fn focus_sessions_insert_writes_row_times_from_record_and_one_log_row_per_column() {
        let store = Store::open_in_memory("device-a").expect("opens");
        let session = record("0193a1b2-session");
        // A recovery insert happens long after the session ended.
        store
            .write(1_794_099_999_000, |txn| insert(txn, &session))
            .expect("writes");

        store
            .read(|txn| {
                let row = txn.conn().query_row(
                    "SELECT id, created_at, updated_at, deleted_at, preset, phase, planned_ms,
                            started_at, ended_at, paused_total_ms, focused_ms, end_reason,
                            extensions, intent
                     FROM focus_session",
                    [],
                    |row| {
                        Ok((
                            (
                                row.get::<_, String>(0)?,
                                row.get::<_, i64>(1)?,
                                row.get::<_, i64>(2)?,
                                row.get::<_, Option<i64>>(3)?,
                                row.get::<_, String>(4)?,
                                row.get::<_, String>(5)?,
                                row.get::<_, i64>(6)?,
                            ),
                            (
                                row.get::<_, i64>(7)?,
                                row.get::<_, i64>(8)?,
                                row.get::<_, i64>(9)?,
                                row.get::<_, i64>(10)?,
                                row.get::<_, String>(11)?,
                                row.get::<_, i64>(12)?,
                                row.get::<_, Option<String>>(13)?,
                            ),
                        ))
                    },
                )?;
                assert_eq!(
                    row,
                    (
                        (
                            "0193a1b2-session".into(),
                            1_794_012_700_000,
                            1_794_012_700_000,
                            None,
                            "library".into(),
                            "focus".into(),
                            3_000_000,
                        ),
                        (
                            1_794_009_600_000,
                            1_794_012_700_000,
                            100_000,
                            3_000_000,
                            "completed".into(),
                            2,
                            None,
                        ),
                    )
                );

                let mut stmt = txn.conn().prepare(
                    "SELECT entity, entity_id, field, value, device_id FROM change_log ORDER BY seq",
                )?;
                let logged: Vec<(String, String, String, String, String)> = stmt
                    .query_map([], |row| {
                        Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
                    })?
                    .collect::<Result<_, _>>()?;
                let expected = [
                    ("preset", "\"library\""),
                    ("phase", "\"focus\""),
                    ("planned_ms", "3000000"),
                    ("started_at", "1794009600000"),
                    ("ended_at", "1794012700000"),
                    ("paused_total_ms", "100000"),
                    ("focused_ms", "3000000"),
                    ("end_reason", "\"completed\""),
                    ("extensions", "2"),
                    ("preset_id", "\"0193-preset\""),
                    ("preset_name", "\"50/10\""),
                    ("focus_min", "50"),
                    ("break_min", "10"),
                    ("long_break_min", "20"),
                    ("rounds", "4"),
                ];
                assert_eq!(logged.len(), expected.len());
                for (row, (field, value)) in logged.iter().zip(expected) {
                    assert_eq!(row.0, "focus_session");
                    assert_eq!(row.1, "0193a1b2-session");
                    assert_eq!(row.2, field);
                    assert_eq!(row.3, value, "{field}");
                    assert_eq!(row.4, "device-a");
                }
                assert_eq!(
                    count(txn.conn(), "SELECT count(*) FROM change_log WHERE field = 'intent'"),
                    0
                );
                Ok(())
            })
            .expect("reads");
    }

    #[test]
    fn insert_writes_the_snapshot_columns_for_a_library_session_and_nulls_for_quick() {
        let store = Store::open_in_memory("device-a").expect("opens");
        let quick = SessionRecord {
            preset: SessionPreset::Quick,
            ..record("quick")
        };
        store
            .write(1, |txn| {
                insert(txn, &record("lib"))?;
                insert(txn, &quick)
            })
            .expect("writes");
        let read = |id: &str| {
            store
                .read(|txn| {
                    Ok(txn.conn().query_row(
                        "SELECT preset, preset_id, preset_name, focus_min, break_min,
                                long_break_min, rounds
                         FROM focus_session WHERE id = ?1",
                        [id],
                        |row| {
                            Ok((
                                row.get::<_, String>(0)?,
                                row.get::<_, Option<String>>(1)?,
                                row.get::<_, Option<String>>(2)?,
                                row.get::<_, Option<i64>>(3)?,
                                row.get::<_, Option<i64>>(4)?,
                                row.get::<_, Option<i64>>(5)?,
                                row.get::<_, Option<i64>>(6)?,
                            ))
                        },
                    )?)
                })
                .expect("reads")
        };
        assert_eq!(
            read("lib"),
            (
                "library".into(),
                Some("0193-preset".into()),
                Some("50/10".into()),
                Some(50),
                Some(10),
                Some(20),
                Some(4)
            )
        );
        assert_eq!(
            read("quick"),
            ("quick".into(), None, None, None, None, None, None)
        );
    }

    #[test]
    fn focus_sessions_insert_same_id_twice_fails() {
        let store = Store::open_in_memory("device-a").expect("opens");
        store
            .write(1_000, |txn| insert(txn, &record("same")))
            .expect("first insert");
        let second = store.write(2_000, |txn| insert(txn, &record("same")));
        match second {
            Err(StoreError::Sqlite(message)) => {
                assert!(
                    message.contains("UNIQUE") || message.contains("PRIMARY"),
                    "{message}"
                )
            }
            other => panic!("expected a constraint error, got {other:?}"),
        }
        store
            .read(|txn| {
                assert_eq!(count(txn.conn(), "SELECT count(*) FROM focus_session"), 1);
                assert_eq!(count(txn.conn(), "SELECT count(*) FROM change_log"), 15);
                Ok(())
            })
            .expect("reads");
    }

    fn insert_raw(store: &Store, id: &str, started: i64, deleted: Option<i64>, preset: &str) {
        store
            .write(1, |txn| {
                txn.conn().execute(
                    "INSERT INTO focus_session (id, created_at, updated_at, deleted_at, preset,
                         phase, planned_ms, started_at, ended_at, paused_total_ms, focused_ms,
                         end_reason, extensions)
                     VALUES (?1, 0, 0, ?2, ?3, 'focus', 1, ?4, ?4 + 10, 0, 5, 'completed', 0)",
                    rusqlite::params![id, deleted, preset, started],
                )?;
                Ok(())
            })
            .expect("inserts");
    }

    #[test]
    fn started_between_excludes_deleted_in_start_order() {
        let store = Store::open_in_memory("device-a").expect("opens");
        insert_raw(&store, "c", 300, None, "fifty_ten");
        insert_raw(&store, "a", 100, None, "classic");
        insert_raw(&store, "gone", 200, Some(999), "classic");
        insert_raw(&store, "before", 99, None, "classic");
        insert_raw(&store, "end", 400, None, "classic");
        insert_raw(&store, "b", 150, None, "classic");

        let rows = store
            .read(|txn| started_between(txn, 100, 400))
            .expect("reads");
        let ids: Vec<_> = rows.iter().map(|row| row.id.as_str()).collect();
        assert_eq!(ids, ["a", "b", "c"]);
        assert_eq!(rows[2].preset, "fifty_ten", "old preset names still read");
        assert_eq!(rows[0].ended_ms, 110);
        assert_eq!(rows[0].break_kind, None);
    }
}
