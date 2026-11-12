//! Seeding the preset library, and migrating the old `timer.preset` and `timer.custom`.

use orasenda_core::{NotificationStatus, PresetDef};
use orasenda_store::{Store, meta, presets, settings};

use super::super::test_support::*;
use super::super::*;
use crate::api::Settings;
use crate::scheduler;
use crate::session::presets::{KEY_CUSTOM, META_PRESET_SEED};

fn launch(store: Store) -> SessionService {
    SessionService::new(
        Ok(store),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    )
}

/// A pre-E store: the old `timer.preset` (and `timer.custom`) stored, the seed pending.
fn old_store(preset: Option<&str>, custom: Option<(u16, u16)>) -> Store {
    let store = memory_store();
    store
        .write(0, |txn| {
            if let Some(preset) = preset {
                settings::set(txn, KEY_PRESET, &preset)?;
            }
            if let Some((focus_min, break_min)) = custom {
                let value = serde_json::json!({ "focusMin": focus_min, "breakMin": break_min });
                settings::set(txn, KEY_CUSTOM, &value)?;
            }
            Ok(())
        })
        .expect("stores the old settings");
    store
}

fn stored_live(s: &SessionService) -> Vec<PresetDef> {
    db(s)
        .read(|txn| Ok(presets::list(txn)?.into_iter().map(|p| p.def).collect()))
        .expect("reads")
}

fn names(presets: &[PresetDef]) -> Vec<&str> {
    presets.iter().map(|p| p.name.as_str()).collect()
}

fn marker_pending(s: &SessionService) -> bool {
    db(s)
        .read(|txn| Ok(meta::get(txn, META_PRESET_SEED)?.is_some()))
        .expect("reads")
}

#[test]
fn seed_fresh_database_three_defaults() {
    let s = launch(memory_store());
    let live = stored_live(&s);
    let shape: Vec<_> = live
        .iter()
        .map(|p| {
            (
                p.name.as_str(),
                p.focus_min,
                p.break_min,
                p.long_break_min,
                p.rounds,
            )
        })
        .collect();
    assert_eq!(
        shape,
        [
            ("Gentle Start", 15, 5, 15, 4),
            ("Steady Focus", 25, 5, 15, 4),
            ("Deep Work", 90, 15, 30, 2),
        ]
    );
    assert_eq!(
        s.settings().preset_id,
        default_id(1),
        "Steady Focus is selected"
    );
    assert_eq!(
        names(&s.presets),
        ["Gentle Start", "Steady Focus", "Deep Work"]
    );
    assert!(!marker_pending(&s));
    assert_eq!(s.view(T0).store, crate::api::StoreStatus::Ok);
}

#[test]
fn seed_maps_each_old_preset() {
    // classic and an absent value: Steady Focus.
    for old in [Some("classic"), None, Some("nonsense")] {
        let s = launch(old_store(old, None));
        assert_eq!(s.settings().preset_id, default_id(1), "{old:?}");
        assert_eq!(stored_live(&s).len(), 3, "{old:?}");
    }
    // deep_block: Deep Work.
    let s = launch(old_store(Some("deep_block"), None));
    assert_eq!(s.settings().preset_id, default_id(2));
    assert_eq!(stored_live(&s).len(), 3);

    // fifty_ten: a user preset after the defaults, selected.
    let s = launch(old_store(Some("fifty_ten"), None));
    let live = stored_live(&s);
    assert_eq!(
        names(&live),
        ["Gentle Start", "Steady Focus", "Deep Work", "50/10"]
    );
    let fifty = &live[3];
    assert_eq!(
        (
            fifty.focus_min,
            fifty.break_min,
            fifty.long_break_min,
            fifty.rounds
        ),
        (50, 10, 20, 4)
    );
    assert_eq!(fifty.default_key, None);
    assert_eq!(s.settings().preset_id, fifty.id);
    assert_eq!(s.selected().name, "50/10");

    // custom: "Custom", break x 3, after 4.
    let s = launch(old_store(Some("custom"), Some((45, 10))));
    let live = stored_live(&s);
    assert_eq!(
        names(&live),
        ["Gentle Start", "Steady Focus", "Deep Work", "Custom"]
    );
    let custom = &live[3];
    assert_eq!(
        (
            custom.focus_min,
            custom.break_min,
            custom.long_break_min,
            custom.rounds
        ),
        (45, 10, 30, 4)
    );
    assert_eq!(s.settings().preset_id, custom.id);

    // A custom whose long break would pass 90 is clamped; an unusable one falls back.
    let s = launch(old_store(Some("custom"), Some((30, 60))));
    assert_eq!(stored_live(&s)[3].long_break_min, 90);
    let s = launch(old_store(Some("custom"), Some((4, 10))));
    let fallback = &stored_live(&s)[3];
    assert_eq!(
        (
            fallback.name.as_str(),
            fallback.focus_min,
            fallback.break_min,
            fallback.long_break_min
        ),
        ("Custom", 45, 10, 30)
    );
    assert_eq!(s.settings().preset_id, fallback.id);
    let s = launch(old_store(Some("custom"), None));
    let fallback = &stored_live(&s)[3];
    assert_eq!((fallback.focus_min, fallback.break_min), (45, 10));
    assert_eq!(s.settings().preset_id, fallback.id);
}

#[test]
fn seed_converted_preset_is_not_made_when_it_was_not_selected() {
    // Only the selected old preset is kept: a stored custom with classic selected adds nothing.
    let s = launch(old_store(Some("classic"), Some((45, 10))));
    assert_eq!(stored_live(&s).len(), 3);
}

#[test]
fn seed_runs_once() {
    let mut s = launch(memory_store());
    // The person removes a default and picks another; a later launch must not undo either.
    db(&s)
        .write(T0, |txn| presets::remove(txn, &default_id(0)))
        .expect("removes");
    s.set_settings(
        Settings {
            preset_id: default_id(2),
            ..Settings::default()
        },
        T0,
    )
    .expect("selects");
    let changes = db(&s).change_log_ids().len();
    let back = relaunch(&mut s, T0 + MINUTE);
    assert_eq!(names(&stored_live(&back)), ["Steady Focus", "Deep Work"]);
    assert_eq!(names(&back.presets), ["Steady Focus", "Deep Work"]);
    assert_eq!(back.settings().preset_id, default_id(2));
    assert_eq!(
        db(&back).change_log_ids().len(),
        changes,
        "nothing was written"
    );
}

#[test]
fn seed_keeps_a_tombstoned_default_tombstoned_and_ignores_existing_rows() {
    // Sync brought a tombstoned Gentle Start and a changed Steady Focus before the seed ran.
    let store = memory_store();
    store
        .write(1, |txn| {
            let mut gentle = orasenda_core::default_presets()[0].clone();
            gentle.name = "Gentle Start".into();
            presets::insert(
                txn,
                &presets::StoredPreset {
                    def: gentle,
                    position: 0,
                    deleted_at: Some(5),
                },
            )?;
            let mut steady = orasenda_core::default_presets()[1].clone();
            steady.focus_min = 30;
            presets::insert(
                txn,
                &presets::StoredPreset {
                    def: steady,
                    position: 1,
                    deleted_at: None,
                },
            )
        })
        .expect("rows exist");
    let s = launch(store);
    let live = stored_live(&s);
    assert_eq!(names(&live), ["Steady Focus", "Deep Work"]);
    assert_eq!(
        live[0].focus_min, 30,
        "insert-or-ignore keeps the existing row"
    );
}

#[test]
fn seed_failure_shows_core_defaults_read_only_and_is_owed() {
    let store = memory_store();
    store.fail_writes(true);
    let mut s = launch(store);
    assert!(s.recover_owed.presets);
    assert_eq!(s.view(T0).store, crate::api::StoreStatus::Unavailable);
    assert_eq!(
        names(&s.presets),
        ["Gentle Start", "Steady Focus", "Deep Work"]
    );
    assert_eq!(s.settings().preset_id, default_id(1));
    // Read-only: the selection can't be changed meanwhile.
    let error = s
        .set_settings(
            Settings {
                preset_id: default_id(2),
                ..Settings::default()
            },
            T0,
        )
        .expect_err("the library is not loaded");
    assert_eq!(error.kind, crate::api::SettingsErrorKind::Unavailable);
    assert_eq!(s.settings().preset_id, default_id(1));
    // Start uses the presented selection.
    let started = s.apply(start(), T0, id("a"));
    assert_eq!(started.view.preset_name.as_deref(), Some("Steady Focus"));
}

#[test]
fn seed_retry_emits_presets_and_settings_changed() {
    let store = old_store(Some("deep_block"), None);
    store.fail_reads(true);
    let s = launch(store);
    assert!(s.recover_owed.presets);
    assert_eq!(s.settings().preset_id, default_id(1), "defaults for now");
    let Fakes { log, notifier, .. } = fakes(NotificationStatus::NotDetermined, false);
    let host = TestHost::with(s, log, notifier);
    host.log().take();

    // Still failing: nothing is adopted.
    scheduler::iterate(&host);
    assert!(
        !host
            .log()
            .take()
            .iter()
            .any(|e| matches!(e, Event::PresetsChanged(_)))
    );

    db(&lock(&host.0.service)).fail_reads(false);
    scheduler::iterate(&host);
    let events = host.log().take();
    let presets_at = events
        .iter()
        .position(|e| matches!(e, Event::PresetsChanged(_)))
        .expect("presets-changed");
    let settings_at = events
        .iter()
        .position(|e| matches!(e, Event::SettingsChanged(_)))
        .expect("settings-changed");
    assert!(presets_at < settings_at, "{events:?}");
    let Event::PresetsChanged(listed) = &events[presets_at] else {
        unreachable!()
    };
    assert_eq!(listed.len(), 3);
    let Event::SettingsChanged(saved) = &events[settings_at] else {
        unreachable!()
    };
    assert_eq!(saved.preset_id, default_id(2), "the migrated selection");
    assert_eq!(
        host.0.under_lock.load(std::sync::atomic::Ordering::SeqCst),
        0
    );
    {
        let s = lock(&host.0.service);
        assert!(!marker_pending(&s));
        assert!(!s.recover_owed.presets);
        assert_eq!(s.view(T0).store, crate::api::StoreStatus::Ok);
    }
    // Once: the next iteration emits neither.
    scheduler::iterate(&host);
    assert!(
        !host
            .log()
            .take()
            .iter()
            .any(|e| matches!(e, Event::PresetsChanged(_) | Event::SettingsChanged(_)))
    );
}

#[test]
fn library_retry_without_a_seed_still_emits_presets_changed() {
    // The seed had already run; only the read was owed. No settings re-read is needed, but
    // the cache changed, so both events go out.
    let mut s = launch(memory_store());
    s.recover_owed.presets = true;
    let effects = s.tick(T0 + 1);
    assert_eq!(effects.presets_changed.map(|p| p.len()), Some(3));
    assert!(effects.settings_changed.is_some());
    assert!(!s.recover_owed.settings);
    assert!(!s.recover_owed.presets);
}
