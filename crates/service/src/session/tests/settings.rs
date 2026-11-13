//! Reading and saving the settings.

use orasenda_core::{NotificationStatus, PresetId, format_clock};
use orasenda_store::{OpenError, settings};

use super::super::test_support::*;
use super::super::*;
use crate::api::{Settings, SettingsErrorKind, StoreStatus, Theme};

#[test]
fn undecodable_setting_falls_back_to_default_without_rewrite() {
    let store = seeded_store();
    store
        .write(T0, |txn| {
            orasenda_store::settings::set(txn, "timer.preset", &5)?;
            orasenda_store::settings::set(txn, "timer.extension_cap", &"many")?;
            orasenda_store::settings::set(txn, "notify.session_end", &false)
        })
        .expect("settings written");
    let mut s = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    assert_eq!(s.settings(), Settings::default());
    s.apply(start(), T0, id("a"));
    let raw: Option<serde_json::Value> = db(&s)
        .read(|txn| orasenda_store::settings::get(txn, "timer.preset"))
        .expect("reads");
    assert_eq!(raw, Some(serde_json::json!(5)));
}

#[test]
fn out_of_range_setting_reads_as_its_default() {
    let store = seeded_store();
    store
        .write(T0, |txn| {
            orasenda_store::settings::set(txn, "timer.extension_cap", &9)?;
            orasenda_store::settings::set(txn, "timer.longest_focus_min", &30)?;
            orasenda_store::settings::set(txn, "timer.deep_cap_hours", &1)
        })
        .expect("settings written");
    let s = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    assert_eq!(s.settings(), Settings::default());
}

#[test]
fn every_new_key_round_trips() {
    let mut s = service();
    let all = Settings {
        theme: Theme::Dark,
        preset_id: default_id(2),
        extension_cap: 3,
        auto_continue: true,
        longest_focus_min: 120,
        deep_cap_on: false,
        deep_cap_hours: 6,
        notify_session_end: true,
        notify_two_minutes: true,
        single_key: false,
    };
    s.set_settings(all.clone(), T0).expect("saves");
    assert_eq!(s.settings(), all);
    let back = relaunch(&mut s, T0);
    assert_eq!(back.settings(), all);
}

#[test]
fn settings_set_refuses_unknown_presets_and_out_of_range_values() {
    let mut s = service();
    let valid = Settings {
        preset_id: default_id(2),
        extension_cap: 1,
        longest_focus_min: 100,
        deep_cap_hours: 5,
        ..Settings::default()
    };
    let bad = [
        Settings {
            preset_id: PresetId("not-in-the-library".into()),
            ..valid.clone()
        },
        Settings {
            extension_cap: 4,
            ..valid.clone()
        },
        Settings {
            longest_focus_min: 59,
            ..valid.clone()
        },
        Settings {
            longest_focus_min: 151,
            ..valid.clone()
        },
        Settings {
            deep_cap_hours: 1,
            ..valid.clone()
        },
        Settings {
            deep_cap_hours: 9,
            ..valid.clone()
        },
    ];
    for settings in bad {
        let error = s.set_settings(settings, T0).expect_err("refused");
        assert_eq!(error.kind, SettingsErrorKind::InvalidSpec);
    }
    assert_eq!(s.settings(), Settings::default());

    s.set_settings(valid.clone(), T0)
        .expect("valid settings save");
    assert_eq!(s.settings(), valid);
    let back = relaunch(&mut s, T0);
    assert_eq!(back.settings(), valid);
}

#[test]
fn unknown_preset_id_presents_first_live() {
    let store = seeded_store();
    store
        .write(T0, |txn| {
            orasenda_store::settings::set(txn, "timer.preset", &"0192-removed-preset")
        })
        .expect("written");
    let s = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    assert_eq!(
        s.settings().preset_id,
        default_id(0),
        "the first live preset"
    );
    assert_eq!(s.view(T0).planned_min, None);
    assert_eq!(
        s.clock_tick(T0).idle_finish,
        Some(format_clock(T0 + 15 * MINUTE, OFFSET_MIN, CYCLE)),
        "Start would use it"
    );
    let mut s = s;
    let started = s.apply(start(), T0, id("a"));
    assert_eq!(started.view.preset_name.as_deref(), Some("Gentle Start"));
    assert_eq!(started.view.planned_min, Some(15));
}

#[test]
fn settings_set_write_failure_is_write_and_keeps_the_cache() {
    let mut s = service();
    db(&s).fail_writes(true);
    let error = s
        .set_settings(deep_work(), T0)
        .expect_err("the write fails");
    assert_eq!(error.kind, SettingsErrorKind::Write);
    assert_eq!(s.settings(), Settings::default());
    assert_eq!(s.view(T0).store, StoreStatus::Unavailable);
}

#[test]
fn settings_set_unavailable_when_degraded() {
    let mut s = SessionService::new(
        Err(OpenError::Io("denied".into())),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    assert_eq!(s.view(T0).store, StoreStatus::Unavailable);
    let error = s
        .set_settings(Settings::default(), T0)
        .expect_err("degraded");
    assert_eq!(error.kind, SettingsErrorKind::Unavailable);

    let newer = SessionService::new(
        Err(OpenError::Newer {
            found: 2,
            supported: 1,
        }),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    assert_eq!(newer.view(T0).store, StoreStatus::Newer);
}

#[test]
fn settings_get_defaults_when_degraded() {
    let s = SessionService::new(
        Err(OpenError::Io("denied".into())),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    assert_eq!(s.settings(), Settings::default());
}

/// A pending store with non-default preset/custom and notify stored true, whose launch
/// settings read failed. Returns the service and the change-log length after seeding.
fn read_owed_service() -> (SessionService, usize) {
    read_owed_service_with_theme(Theme::System)
}

fn stored_preset(s: &SessionService) -> Option<PresetId> {
    db(s)
        .read(|txn| settings::get(txn, KEY_PRESET))
        .expect("reads")
}

#[test]
fn settings_set_while_settings_read_owed_writes_only_the_change() {
    let (mut s, before) = read_owed_service();
    assert!(s.recover_owed.settings);
    s.set_notifications(NotificationStatus::Granted);
    db(&s).fail_reads(false);
    let saved = s
        .set_settings(
            Settings {
                theme: Theme::Dark,
                ..Settings::default()
            },
            T0 + 1,
        )
        .expect("saves");
    assert_eq!(stored_preset(&s), Some(default_id(2)));
    assert_eq!(
        db(&s)
            .read(|txn| settings::get::<Theme>(txn, KEY_THEME))
            .expect("reads"),
        Some(Theme::Dark)
    );
    assert_eq!(stored_notify(&s), Some(true));
    assert_eq!(marker(&s), None);
    assert!(saved.presented.notify_session_end);
    assert_eq!(saved.presented.preset_id, default_id(2));
    assert!(!s.recover_owed.settings);
    assert!(!s.settings_event_owed);
    assert!(!s.review_pending);
    assert_eq!(s.store_status, StoreStatus::Ok);
    assert_eq!(
        db(&s).change_log_ids()[before..],
        ["ui.theme", "notify.session_end"]
    );
}

#[test]
fn settings_set_while_settings_read_owed_with_unknown_status_leaves_the_review_pending() {
    let (mut s, before) = read_owed_service();
    db(&s).fail_reads(false);
    let saved = s
        .set_settings(
            Settings {
                theme: Theme::Dark,
                ..Settings::default()
            },
            T0 + 1,
        )
        .expect("saves");
    assert_eq!(stored_notify(&s), Some(true));
    assert_eq!(marker(&s).as_deref(), Some("pending"));
    assert!(!saved.presented.notify_session_end);
    assert!(s.review_pending);
    assert!(!s.recover_owed.settings);
    assert_eq!(db(&s).change_log_ids()[before..], ["ui.theme"]);
    assert_eq!(stored_preset(&s), Some(default_id(2)));
}

#[test]
fn unchanged_keys_log_no_change_log_row() {
    let mut s = service();
    s.set_settings(
        Settings {
            theme: Theme::Dark,
            ..Settings::default()
        },
        T0,
    )
    .expect("saves");
    let seeded = db(&s).change_log_ids().len() - 1;
    assert_eq!(db(&s).change_log_ids()[seeded..], ["ui.theme"]);
    s.set_settings(
        Settings {
            theme: Theme::Dark,
            ..Settings::default()
        },
        T0,
    )
    .expect("an unchanged save succeeds");
    assert_eq!(db(&s).change_log_ids()[seeded..], ["ui.theme"]);
}

#[test]
fn settings_single_key_default_true() {
    let defaults = Settings::default();
    assert!(defaults.single_key);
    let mut s = service();
    assert!(s.settings().single_key);
    // It saves through the ordinary settings chain and survives a relaunch.
    let off = Settings {
        single_key: false,
        ..s.settings()
    };
    s.set_settings(off, T0).expect("saves");
    assert!(!s.settings().single_key);
    assert!(!relaunch(&mut s, T0 + 1).settings().single_key);
}
