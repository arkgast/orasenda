//! Import and the key model: the fold of an old file's legacy keys, repair, re-registration,
//! and the preset cap with a legacy selected preset (#438).

use std::sync::Arc;

use orasenda_core::{PresetDef, PresetId, default_presets};
use orasenda_store::presets::{self, StoredPreset};
use orasenda_store::settings;

use super::super::files::run_import_file;
use super::super::import::run_import;
use super::TempDir;
use super::import::{host_in, source};
use crate::api::{ImportOutcome, ShortcutStatus};
use crate::keyboard::test_support::FakeRegistrar;
use crate::keyboard::{ActionId, KeyboardService};
use crate::scheduler::Host;
use crate::session::lock;

/// An old file: its `keys.start_pause` is newer than anything the host wrote.
fn pre_h3_file() -> (TempDir, std::path::PathBuf) {
    source(|s| {
        s.write(9_999_999_999_999, |txn| {
            settings::set(txn, "keys.start_pause", &"Control+Alt+KeyG")
        })
        .unwrap();
    })
}

fn imported(
    registrar: &Arc<FakeRegistrar>,
) -> (
    TempDir,
    crate::session::test_support::TestHost,
    KeyboardService,
) {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    host.set_data_dir(dir.path().to_path_buf());
    let kb = KeyboardService::new(registrar.clone());
    kb.register_saved(&host);
    (dir, host, kb)
}

fn start_pause(kb: &KeyboardService, host: &impl Host) -> (Option<String>, ShortcutStatus) {
    let view = kb.view(host);
    let global = &view.action(ActionId::StartPause).expect("listed").global;
    (global.binding.keys.clone(), global.status)
}

#[test]
fn import_pre_h3_start_pause_registered() {
    let registrar = Arc::new(FakeRegistrar::default());
    let (dir, host, kb) = imported(&registrar);
    let (_keep, path) = pre_h3_file();
    let outcome = run_import_file(&host, &kb, || Ok(Some(path))).expect("imports");
    assert!(matches!(outcome, ImportOutcome::Imported { .. }));
    assert_eq!(
        start_pause(&kb, &host),
        (Some("Control+Alt+KeyG".into()), ShortcutStatus::Registered)
    );
    assert_eq!(registrar.live(ActionId::StartPause), ["Control+Alt+KeyG"]);
    drop(dir);
}

#[test]
fn import_register_failure_marks_failed() {
    let registrar = Arc::new(FakeRegistrar::default());
    let (dir, host, kb) = imported(&registrar);
    registrar.set_failing(true);
    let (_keep, path) = pre_h3_file();
    run_import_file(&host, &kb, || Ok(Some(path))).expect("imports");
    assert_eq!(
        start_pause(&kb, &host),
        (Some("Control+Alt+KeyG".into()), ShortcutStatus::Failed)
    );
    drop(dir);
}

/// #438: the file's `timer.preset` is newer than the seed, so the legacy id is really adopted
/// and the cap must resolve it to Steady Focus and keep that preset.
#[test]
fn cap_keeps_legacy_selected_preset() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let selected = default_presets()[1].id.clone();
    let (_keep, path) = source(|s| {
        s.write(9_999_999_999_999, |txn| {
            settings::set(txn, "timer.preset", &"classic")
        })
        .unwrap();
        for i in 0..12u64 {
            let stored = StoredPreset {
                def: PresetDef {
                    id: PresetId(format!("p{i:02}")),
                    name: format!("Mine {i}"),
                    focus_min: 30,
                    break_min: 5,
                    long_break_min: 15,
                    rounds: 4,
                    default_key: None,
                },
                position: 10 + i as u32,
                deleted_at: None,
            };
            s.write(1_794_009_700_000 + i * 1000, |txn| {
                presets::insert(txn, &stored)
            })
            .unwrap();
        }
    });
    run_import(&host, dir.path(), &path).expect("imports");
    let guard = lock(host.service().unwrap());
    let stored = guard
        .store()
        .unwrap()
        .read(|txn| settings::get::<String>(txn, "timer.preset"))
        .unwrap();
    assert_eq!(
        stored.as_deref(),
        Some("classic"),
        "the legacy id was adopted"
    );
    assert!(
        guard.presets().iter().any(|p| p.id == selected),
        "the preset the legacy id names survives the cap"
    );
}
