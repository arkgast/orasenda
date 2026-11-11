//! The theme, cached and applied after unlock.

use std::sync::atomic::Ordering;

use orasenda_core::{NotificationStatus, Preset};
use orasenda_store::settings;

use super::super::*;
use super::helpers::*;
use super::support::*;
use crate::ipc::{Settings, SettingsErrorKind, Theme};
use crate::scheduler;

#[test]
fn settings_round_trip_with_theme() {
    let mut s = service();
    let dark = Settings {
        theme: Theme::Dark,
        ..Settings::default()
    };
    s.set_settings(dark, T0).expect("settings save");
    assert_eq!(s.settings().theme, Theme::Dark);
    let raw: Option<serde_json::Value> = db(&s)
        .read(|txn| orasenda_store::settings::get(txn, "ui.theme"))
        .expect("reads");
    assert_eq!(raw, Some(serde_json::json!("dark")));
    let back = relaunch(&mut s, T0);
    assert_eq!(back.settings().theme, Theme::Dark);
}

#[test]
fn undecodable_theme_reads_as_system() {
    let store = memory_store();
    store
        .write(T0, |txn| {
            orasenda_store::settings::set(txn, "ui.theme", &"sepia")
        })
        .expect("writes");
    let mut s = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    assert_eq!(s.settings(), Settings::default());
    s.apply(start(Preset::Classic), T0, id("a"));
    let raw: Option<serde_json::Value> = db(&s)
        .read(|txn| orasenda_store::settings::get(txn, "ui.theme"))
        .expect("reads");
    assert_eq!(raw, Some(serde_json::json!("sepia")));
}

#[test]
fn theme_applied_after_unlock_only_when_changed() {
    let host = TestHost::fresh(NotificationStatus::Granted);
    host.log().take();
    run_set_settings(
        &host,
        Settings {
            theme: Theme::Dark,
            ..Settings::default()
        },
    )
    .expect("saves");
    let events = host.log().take();
    let at = |f: &dyn Fn(&Event) -> bool| events.iter().position(f);
    assert_eq!(
        events
            .iter()
            .filter(|e| matches!(e, Event::ApplyTheme(_)))
            .count(),
        1
    );
    let theme = at(&|e| *e == Event::ApplyTheme(Theme::Dark)).expect("applied");
    let clock = at(&|e| matches!(e, Event::Clock(_))).expect("clock");
    let changed = at(&|e| matches!(e, Event::SettingsChanged(_))).expect("changed");
    assert!(theme < clock && clock < changed, "{events:?}");
    assert_eq!(host.0.under_lock.load(Ordering::SeqCst), 0);

    run_set_settings(
        &host,
        Settings {
            theme: Theme::Dark,
            preset: Preset::FiftyTen,
            ..Settings::default()
        },
    )
    .expect("saves");
    let events = host.log().take();
    assert!(!events.iter().any(|e| matches!(e, Event::ApplyTheme(_))));
    assert_eq!(
        events
            .iter()
            .filter(|e| matches!(e, Event::Clock(_)))
            .count(),
        1
    );
    assert_eq!(
        events
            .iter()
            .filter(|e| matches!(e, Event::SettingsChanged(_)))
            .count(),
        1
    );
}

#[test]
fn recovered_settings_read_applies_the_stored_theme() {
    let host = recovered_theme_host(Some(Theme::Dark));
    scheduler::iterate(&host);
    let events = host.log().take();
    let applied: Vec<usize> = events
        .iter()
        .enumerate()
        .filter(|(_, e)| **e == Event::ApplyTheme(Theme::Dark))
        .map(|(i, _)| i)
        .collect();
    assert_eq!(applied.len(), 1, "{events:?}");
    assert_eq!(
        events
            .iter()
            .filter(|e| matches!(e, Event::ApplyTheme(_)))
            .count(),
        1
    );
    let changed = events
        .iter()
        .position(|e| matches!(e, Event::SettingsChanged(_)))
        .expect("settings-changed");
    assert!(applied[0] < changed, "{events:?}");
    assert_eq!(host.0.under_lock.load(Ordering::SeqCst), 0);
}

#[test]
fn recovered_settings_read_with_the_same_theme_applies_nothing() {
    let host = recovered_theme_host(None);
    scheduler::iterate(&host);
    let events = host.log().take();
    assert!(
        !events.iter().any(|e| matches!(e, Event::ApplyTheme(_))),
        "{events:?}"
    );
    assert_eq!(
        events
            .iter()
            .filter(|e| matches!(e, Event::SettingsChanged(_)))
            .count(),
        1,
        "{events:?}"
    );
}

/// A host whose launch settings read failed and now recovers; `theme` is stored first.
fn recovered_theme_host(theme: Option<Theme>) -> TestHost {
    let store = memory_store();
    if let Some(theme) = theme {
        store
            .write(0, |txn| settings::set(txn, KEY_THEME, &theme))
            .expect("seeds");
    }
    store.fail_reads(true);
    let f = fakes(NotificationStatus::Granted, false);
    let s = SessionService::new(Ok(store), f.platform, T0);
    let host = TestHost::with(s, f.log, f.notifier);
    db(&lock(&host.0.service)).fail_reads(false);
    host.log().take();
    host
}

#[test]
fn settings_set_adopting_stored_values_applies_the_stored_theme() {
    let echo = Settings {
        theme: Theme::System,
        preset: Preset::FiftyTen,
        ..Settings::default()
    };
    let (mut s, _) = read_owed_service_with_theme(Theme::Dark);
    s.set_notifications(NotificationStatus::Granted);
    db(&s).fail_reads(false);
    let saved = s.set_settings(echo.clone(), T0 + 1).expect("saves");
    assert_eq!(saved.theme, Some(Theme::Dark));

    let (mut s, _) = read_owed_service_with_theme(Theme::Dark);
    s.set_notifications(NotificationStatus::Granted);
    db(&s).fail_reads(false);
    let f = fakes(NotificationStatus::Granted, false);
    let host = TestHost::with(s, f.log, f.notifier);
    host.log().take();
    run_set_settings(&host, echo).expect("saves");
    let events = host.log().take();
    let theme = events
        .iter()
        .position(|e| *e == Event::ApplyTheme(Theme::Dark))
        .expect("applied");
    let changed = events
        .iter()
        .position(|e| matches!(e, Event::SettingsChanged(_)))
        .expect("changed");
    assert!(theme < changed, "{events:?}");
    assert_eq!(host.0.under_lock.load(Ordering::SeqCst), 0);
}

#[test]
fn system_theme_clears_override() {
    let host = TestHost::fresh(NotificationStatus::Granted);
    for theme in [Theme::Dark, Theme::System] {
        run_set_settings(
            &host,
            Settings {
                theme,
                ..Settings::default()
            },
        )
        .expect("saves");
    }
    let applied: Vec<_> = host
        .log()
        .take()
        .into_iter()
        .filter(|e| matches!(e, Event::ApplyTheme(_)))
        .collect();
    assert_eq!(
        applied,
        [
            Event::ApplyTheme(Theme::Dark),
            Event::ApplyTheme(Theme::System)
        ]
    );
    assert_eq!(scheduler::tauri_theme(Theme::System), None);
    assert_eq!(
        scheduler::tauri_theme(Theme::Light),
        Some(tauri::Theme::Light)
    );
    assert_eq!(
        scheduler::tauri_theme(Theme::Dark),
        Some(tauri::Theme::Dark)
    );
}

#[test]
fn settings_changed_after_save_and_after_recovered_read() {
    let host = TestHost::fresh(NotificationStatus::Granted);
    host.log().take();
    run_set_settings(&host, fifty_ten()).expect("saves");
    let events = host.log().take();
    let clock = events
        .iter()
        .position(|e| matches!(e, Event::Clock(_)))
        .expect("clock");
    let changed = events
        .iter()
        .position(|e| *e == Event::SettingsChanged(fifty_ten()))
        .expect("one settings-changed");
    assert!(clock < changed);

    let s = relaunch_with_reads_failing(T0 + 1);
    let host = TestHost::with(
        s,
        Log::default(),
        fakes(NotificationStatus::NotDetermined, false).notifier,
    );
    db(&lock(&host.0.service)).fail_reads(false);
    scheduler::iterate(&host);
    let events = settings_events(&host);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].preset, Preset::FiftyTen);
    assert_eq!(host.0.under_lock.load(Ordering::SeqCst), 0);
    scheduler::iterate(&host);
    assert!(settings_events(&host).is_empty());
}

#[test]
fn failed_settings_set_emits_no_settings_changed() {
    let host = TestHost::fresh(NotificationStatus::Granted);
    host.log().take();
    let quick = Settings {
        preset: Preset::Quick,
        ..Settings::default()
    };
    run_set_settings(&host, quick).expect_err("quick is invalid");
    assert!(host.log().take().is_empty());

    db(&lock(&host.0.service)).fail_writes(true);
    let err = run_set_settings(
        &host,
        Settings {
            theme: Theme::Dark,
            preset: Preset::FiftyTen,
            ..Settings::default()
        },
    )
    .expect_err("write fails");
    assert_eq!(err.kind, SettingsErrorKind::Write);
    let events = host.log().take();
    assert_eq!(tick_views(&events).len(), 1, "{events:?}");
    assert!(!events.iter().any(|e| matches!(
        e,
        Event::SettingsChanged(_) | Event::ApplyTheme(_) | Event::Clock(_)
    )));
}

#[test]
fn failed_theme_save_applies_no_theme() {
    let host = TestHost::fresh(NotificationStatus::Granted);
    db(&lock(&host.0.service)).fail_writes(true);
    let err = run_set_settings(
        &host,
        Settings {
            theme: Theme::Dark,
            ..Settings::default()
        },
    )
    .expect_err("write fails");
    assert_eq!(err.kind, SettingsErrorKind::Write);
    assert_eq!(host.log().count(|e| matches!(e, Event::ApplyTheme(_))), 0);
    assert_eq!(current_settings(&host).theme, Theme::System);
}
