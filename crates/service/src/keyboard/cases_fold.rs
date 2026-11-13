//! The fold rule: legacy `keys.start_pause` and `keys.capture` become *Everywhere* bindings.

use orasenda_store::portability::{SettingRow, SyncRows};
use orasenda_store::{Store, meta, settings};

use super::cases_registry::mem_store;
use super::fold::{LEGACY_FOLDED, run_after_import, run_at_launch};

fn put(store: &Store, key: &str, value: &str) {
    store
        .write(1, |txn| settings::set(txn, key, &value.to_string()))
        .expect("writes");
}

fn settings_raw(store: &Store, key: &str, value: i64) {
    store
        .write(1, |txn| settings::set(txn, key, &value))
        .expect("writes");
}

fn row_of(store: &Store, key: &str) -> Option<String> {
    store.read(|txn| settings::get(txn, key)).expect("reads")
}

fn launch(store: &Store) -> bool {
    store.write(2, run_at_launch).expect("folds")
}

fn flagged(store: &Store) -> bool {
    store
        .read(|txn| meta::get(txn, LEGACY_FOLDED))
        .expect("reads")
        .is_some()
}

#[test]
fn fold_old_default_no_row() {
    let store = mem_store();
    put(&store, "keys.start_pause", "Control+Alt+KeyF");
    put(&store, "keys.capture", "Control+Alt+KeyN");
    assert!(launch(&store));
    assert_eq!(row_of(&store, "keys.global.start_pause"), None);
    assert_eq!(row_of(&store, "keys.global.capture"), None);
    assert!(flagged(&store));
}

#[test]
fn fold_off_stays_off() {
    let store = mem_store();
    put(&store, "keys.start_pause", "off");
    assert!(launch(&store));
    assert_eq!(
        row_of(&store, "keys.global.start_pause").as_deref(),
        Some("off")
    );
    assert_eq!(row_of(&store, "keys.global.capture"), None);
}

#[test]
fn fold_custom_kept() {
    let store = mem_store();
    put(&store, "keys.start_pause", "Alt+Control+KeyG");
    assert!(launch(&store));
    assert_eq!(
        row_of(&store, "keys.global.start_pause").as_deref(),
        Some("Control+Alt+KeyG")
    );
}

#[test]
fn fold_unparseable_legacy_no_row() {
    let store = mem_store();
    put(&store, "keys.capture", "nonsense");
    settings_raw(&store, "keys.start_pause", 5);
    assert!(launch(&store));
    assert_eq!(row_of(&store, "keys.global.capture"), None);
    assert!(flagged(&store));
}

#[test]
fn fold_runs_once_per_device() {
    let store = mem_store();
    put(&store, "keys.start_pause", "Control+Alt+KeyG");
    assert!(launch(&store));
    put(&store, "keys.global.start_pause", "Control+Alt+KeyH");
    assert!(!launch(&store));
    assert_eq!(
        row_of(&store, "keys.global.start_pause").as_deref(),
        Some("Control+Alt+KeyH")
    );
}

fn setting(key: &str, value: &str) -> SettingRow {
    SettingRow {
        key: key.into(),
        value: serde_json::to_string(value).expect("json"),
        updated_at: 5,
    }
}

fn file(rows: &[SettingRow]) -> SyncRows {
    SyncRows {
        settings: rows.to_vec(),
        presets: vec![],
        sessions: vec![],
        notes: vec![],
    }
}

#[test]
fn fold_after_import_only_legacy_only() {
    let store = mem_store();
    assert!(launch(&store));
    put(&store, "keys.global.start_pause", "Control+Alt+KeyH");
    put(&store, "keys.global.capture", "Control+Alt+KeyJ");

    // Legacy keys alone: they overwrite the current bindings of those two actions.
    let legacy = file(&[
        setting("keys.start_pause", "Control+Alt+KeyG"),
        setting("keys.capture", "Control+Alt+KeyN"),
    ]);
    assert!(
        store
            .write(3, |txn| run_after_import(txn, &legacy))
            .expect("folds")
    );
    assert_eq!(
        row_of(&store, "keys.global.start_pause").as_deref(),
        Some("Control+Alt+KeyG")
    );
    // The old default resets the binding to the new default.
    assert_eq!(
        row_of(&store, "keys.global.capture").as_deref(),
        Some("Control+Alt+Super+KeyN")
    );

    // New-model rows in the file: no fold.
    put(&store, "keys.global.start_pause", "Control+Alt+KeyH");
    let mixed = file(&[
        setting("keys.start_pause", "Control+Alt+KeyG"),
        setting("keys.app.floater", "Control+Super+KeyJ"),
    ]);
    assert!(
        !store
            .write(4, |txn| run_after_import(txn, &mixed))
            .expect("runs")
    );
    assert_eq!(
        row_of(&store, "keys.global.start_pause").as_deref(),
        Some("Control+Alt+KeyH")
    );

    // No legacy keys at all: no fold.
    let none = file(&[setting("theme", "dark")]);
    assert!(
        !store
            .write(5, |txn| run_after_import(txn, &none))
            .expect("runs")
    );
}
