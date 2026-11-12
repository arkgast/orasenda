use super::*;
use crate::Store;
use crate::migrate::{MIGRATIONS, PRESET_LIBRARY_SQL};
use crate::test_support::count;
use orasenda_core::default_presets;

fn stored(index: usize) -> StoredPreset {
    StoredPreset {
        def: default_presets()[index].clone(),
        position: index as u32,
        deleted_at: None,
    }
}

fn log(store: &Store) -> Vec<(String, String, String, String)> {
    store
        .read(|txn| {
            let mut stmt = txn
                .conn()
                .prepare("SELECT entity, entity_id, field, value FROM change_log ORDER BY seq")?;
            let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?;
            Ok(rows.collect::<Result<_, _>>()?)
        })
        .expect("reads log")
}

fn seeded() -> Store {
    let store = Store::open_in_memory("device-a").expect("opens");
    store
        .write(1_000, |txn| {
            for index in [2, 0, 1] {
                insert(txn, &stored(index))?;
            }
            Ok(())
        })
        .expect("inserts");
    store
}

#[test]
fn preset_insert_logs_every_field_and_list_orders_by_position() {
    let store = seeded();
    let names: Vec<_> = store
        .read(list)
        .expect("lists")
        .into_iter()
        .map(|p| p.def.name)
        .collect();
    assert_eq!(names, ["Gentle Start", "Steady Focus", "Deep Work"]);
    let rows = log(&store);
    assert_eq!(rows.len(), 21);
    assert!(rows.iter().all(|r| r.0 == "preset"));
    assert_eq!(
        rows[0..7].iter().map(|r| r.2.as_str()).collect::<Vec<_>>(),
        [
            "name",
            "focus_min",
            "break_min",
            "long_break_min",
            "rounds",
            "position",
            "default_key"
        ]
    );
    assert_eq!(rows[6].3, "\"deep_work\"");
}

#[test]
fn preset_update_logs_only_changed_fields() {
    let store = seeded();
    let before = log(&store).len();
    let mut edited = stored(1);
    edited.def.name = "Steady".into();
    edited.def.focus_min = 30;
    store
        .write(2_000, |txn| update(txn, &edited))
        .expect("updates");

    let rows = log(&store);
    let new: Vec<_> = rows[before..]
        .iter()
        .map(|r| (r.2.as_str(), r.3.as_str()))
        .collect();
    assert_eq!(new, [("name", "\"Steady\""), ("focus_min", "30")]);
    assert_eq!(rows[before].1, edited.def.id.0);
    let got = store.read(|txn| get(txn, &edited.def.id)).expect("gets");
    assert_eq!(got, Some(edited.clone()));
    let updated_at: i64 = store
        .read(|txn| {
            Ok(txn.conn().query_row(
                "SELECT updated_at FROM preset WHERE id = ?1",
                [&edited.def.id.0],
                |r| r.get(0),
            )?)
        })
        .expect("reads");
    assert_eq!(updated_at, 2_000);

    store
        .write(3_000, |txn| update(txn, &edited))
        .expect("no-op update");
    assert_eq!(
        log(&store).len(),
        before + 2,
        "an unchanged preset logs nothing"
    );
}

#[test]
fn preset_update_missing_is_an_error() {
    let store = Store::open_in_memory("device-a").expect("opens");
    let result = store.write(1, |txn| update(txn, &stored(0)));
    assert!(matches!(result, Err(StoreError::Sqlite(_))), "{result:?}");
    let id = stored(0).def.id;
    let removed = store.write(1, |txn| remove(txn, &id));
    assert!(matches!(removed, Err(StoreError::Sqlite(_))), "{removed:?}");
    let restored = store.write(1, |txn| undelete(txn, &id));
    assert!(
        matches!(restored, Err(StoreError::Sqlite(_))),
        "{restored:?}"
    );
}

#[test]
fn preset_negative_deleted_at_is_an_error() {
    let store = seeded();
    let id = stored(1).def.id;
    store
        .write(1, |txn| {
            txn.conn()
                .execute("UPDATE preset SET deleted_at = -5 WHERE id = ?1", [&id.0])?;
            Ok(())
        })
        .expect("sets");
    let result = store.read(list_with_removed);
    assert!(matches!(result, Err(StoreError::Sqlite(_))), "{result:?}");
}

#[test]
fn preset_remove_is_tombstone() {
    let store = seeded();
    let before = log(&store).len();
    let id = stored(1).def.id;
    store.write(5_000, |txn| remove(txn, &id)).expect("removes");

    let rows = log(&store);
    assert_eq!(rows.len(), before + 1);
    assert_eq!(
        (
            rows[before].1.as_str(),
            rows[before].2.as_str(),
            rows[before].3.as_str()
        ),
        (id.0.as_str(), "deleted_at", "5000")
    );
    let live: Vec<_> = store
        .read(list)
        .expect("lists")
        .into_iter()
        .map(|p| p.def.id)
        .collect();
    assert!(!live.contains(&id));
    let all = store.read(list_with_removed).expect("lists all");
    assert_eq!(all.len(), 3);
    let removed = store
        .read(|txn| get(txn, &id))
        .expect("gets")
        .expect("row stays");
    assert_eq!(removed.deleted_at, Some(5_000));

    store
        .write(6_000, |txn| remove(txn, &id))
        .expect("again is a no-op");
    assert_eq!(log(&store).len(), before + 1);

    store
        .write(7_000, |txn| undelete(txn, &id))
        .expect("restores");
    let rows = log(&store);
    assert_eq!(
        rows.last().map(|r| (r.2.as_str(), r.3.as_str())),
        Some(("deleted_at", "null"))
    );
    assert_eq!(store.read(list).expect("lists").len(), 3);
    store
        .read(|txn| {
            assert_eq!(count(txn.conn(), "SELECT count(*) FROM preset"), 3);
            Ok(())
        })
        .expect("reads");
}

#[test]
fn preset_library_migrates_from_previous_schema() {
    let mine = PRESET_LIBRARY_SQL;
    let index = MIGRATIONS
        .iter()
        .position(|(_, sql)| *sql == mine)
        .expect("listed");
    let dir = crate::test_support::TempDir::new("preset-migrate");
    {
        let conn = rusqlite::Connection::open(dir.db()).expect("opens");
        for (version, sql) in &MIGRATIONS[..index] {
            conn.execute_batch(sql).expect("applies");
            conn.pragma_update(None, "user_version", version)
                .expect("version");
        }
        conn.execute_batch(
            "INSERT INTO meta (key, value) VALUES ('device_id', 'device-a');
             INSERT INTO active_session (singleton, snapshot, updated_at) VALUES (1, '{}', 1);
             INSERT INTO focus_session (id, created_at, updated_at, preset, phase, planned_ms,
                 started_at, ended_at, paused_total_ms, focused_ms, end_reason)
             VALUES ('old', 1, 1, 'fifty_ten', 'focus', 3000000, 10, 20, 0, 5, 'completed');",
        )
        .expect("seeds old data");
    }

    let store = Store::open(&dir.db(), "device-a").expect("migrates");
    store
        .read(|txn| {
            assert_eq!(count(txn.conn(), "SELECT count(*) FROM active_session"), 0);
            assert_eq!(count(txn.conn(), "SELECT count(*) FROM preset"), 0);
            let marker = crate::meta::get(txn, "preset_seed")?;
            assert_eq!(marker.as_deref(), Some("pending"));
            let rows = crate::focus_sessions::started_between(txn, 0, 100)?;
            assert_eq!(rows.len(), 1);
            assert_eq!(
                (rows[0].preset.as_str(), rows[0].break_kind.clone()),
                ("fifty_ten", None)
            );
            Ok(())
        })
        .expect("reads");
}
