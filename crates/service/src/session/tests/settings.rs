//! Reading and saving the settings.

use orasenda_core::{CustomSpec, NotificationStatus, Preset};
use orasenda_store::{OpenError, settings};

use super::super::test_support::*;
use super::super::*;
use crate::api::{Settings, SettingsErrorKind, StoreStatus, Theme};

#[test]
fn undecodable_setting_falls_back_to_default_without_rewrite() {
    let store = memory_store();
    let custom = CustomSpec {
        focus_min: 30,
        break_min: 5,
    };
    store
        .write(T0, |txn| {
            orasenda_store::settings::set(txn, "timer.preset", &"nonsense")?;
            orasenda_store::settings::set(txn, "timer.custom", &custom)?;
            orasenda_store::settings::set(txn, "notify.session_end", &false)
        })
        .expect("settings written");
    let mut s = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    assert_eq!(
        s.settings(),
        Settings {
            theme: Theme::System,
            preset: Preset::Classic,
            custom,
            notify_session_end: false,
        }
    );
    s.apply(start(Preset::Classic), T0, id("a"));
    let raw: Option<serde_json::Value> = db(&s)
        .read(|txn| orasenda_store::settings::get(txn, "timer.preset"))
        .expect("reads");
    assert_eq!(raw, Some(serde_json::json!("nonsense")));
}

#[test]
fn settings_set_refuses_quick_and_out_of_range_custom() {
    let mut s = service();
    let valid = Settings {
        theme: Theme::System,
        preset: Preset::DeepBlock,
        custom: CustomSpec {
            focus_min: 60,
            break_min: 10,
        },
        notify_session_end: false,
    };
    let quick = Settings {
        theme: Theme::System,
        preset: Preset::Quick,
        ..valid.clone()
    };
    let error = s.set_settings(quick, T0).expect_err("quick is refused");
    assert_eq!(error.kind, SettingsErrorKind::InvalidSpec);
    for (focus_min, break_min) in [(4, 5), (181, 5), (30, 0), (30, 61)] {
        let bad = Settings {
            theme: Theme::System,
            preset: Preset::Custom,
            custom: CustomSpec {
                focus_min,
                break_min,
            },
            notify_session_end: true,
        };
        let error = s.set_settings(bad, T0).expect_err("out of range");
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
fn settings_set_write_failure_is_write_and_keeps_the_cache() {
    let mut s = service();
    db(&s).fail_writes(true);
    let changed = Settings {
        theme: Theme::System,
        preset: Preset::FiftyTen,
        ..Settings::default()
    };
    let error = s.set_settings(changed, T0).expect_err("the write fails");
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

    let store = memory_store();
    store
        .write(T0, |txn| {
            orasenda_store::settings::set(txn, "timer.preset", &Preset::Quick)
        })
        .expect("written");
    let s = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    assert_eq!(s.settings().preset, Preset::Classic, "never quick");
}

/// A pending store with non-default preset/custom and notify stored true, whose launch
/// settings read failed. Returns the service and the change-log length after seeding.
fn read_owed_service() -> (SessionService, usize) {
    read_owed_service_with_theme(Theme::System)
}

fn stored_custom(s: &SessionService) -> (Option<Preset>, Option<CustomSpec>) {
    db(s)
        .read(|txn| {
            Ok((
                settings::get(txn, KEY_PRESET)?,
                settings::get(txn, KEY_CUSTOM)?,
            ))
        })
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
    assert_eq!(
        stored_custom(&s),
        (
            Some(Preset::Custom),
            Some(CustomSpec {
                focus_min: 50,
                break_min: 10
            })
        )
    );
    assert_eq!(
        db(&s)
            .read(|txn| settings::get::<Theme>(txn, KEY_THEME))
            .expect("reads"),
        Some(Theme::Dark)
    );
    assert_eq!(stored_notify(&s), Some(true));
    assert_eq!(marker(&s), None);
    assert!(saved.presented.notify_session_end);
    assert_eq!(saved.presented.preset, Preset::Custom);
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
    assert_eq!(stored_custom(&s).0, Some(Preset::Custom));
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
    assert_eq!(db(&s).change_log_ids(), ["ui.theme"]);
    s.set_settings(
        Settings {
            theme: Theme::Dark,
            ..Settings::default()
        },
        T0,
    )
    .expect("an unchanged save succeeds");
    assert_eq!(db(&s).change_log_ids(), ["ui.theme"]);
}
