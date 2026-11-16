//! The five review settings: defaults, ranges and saving.

use orasenda_core::NotificationStatus;

use super::super::test_support::*;
use super::super::*;
use crate::api::{Settings, WeeklyDay};

fn read_with<T: serde::Serialize>(key: &str, value: &T) -> Settings {
    let store = seeded_store();
    store
        .write(T0, |txn| orasenda_store::settings::set(txn, key, value))
        .expect("settings written");
    SessionService::new(
        Ok(store),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    )
    .settings()
}

#[test]
fn review_settings_defaults() {
    let s = service().settings();
    assert_eq!(s.review_focus_goal_hours, 0);
    assert!(!s.notify_shutdown_due);
    assert!(!s.notify_weekly_review);
    assert_eq!(s.review_shutdown_time, 1050);
    assert_eq!(s.review_weekly_day, WeeklyDay::Fri);
}

#[test]
fn shutdown_time_under_240_reads_default() {
    let s = read_with("review.shutdown_time", &239);
    assert_eq!(s.review_shutdown_time, 1050);
    assert_eq!(
        read_with("review.shutdown_time", &240).review_shutdown_time,
        240
    );
}

#[test]
fn shutdown_time_over_1439_reads_default() {
    let s = read_with("review.shutdown_time", &1440);
    assert_eq!(s.review_shutdown_time, 1050);
    assert_eq!(
        read_with("review.shutdown_time", &1439).review_shutdown_time,
        1439
    );
}

#[test]
fn focus_goal_over_60_reads_default() {
    assert_eq!(
        read_with("review.focus_goal_hours", &61).review_focus_goal_hours,
        0
    );
    assert_eq!(
        read_with("review.focus_goal_hours", &60).review_focus_goal_hours,
        60
    );
}

#[test]
fn weekly_day_unknown_reads_default() {
    assert_eq!(
        read_with("review.weekly_day", &"tue").review_weekly_day,
        WeeklyDay::Fri
    );
    assert_eq!(
        read_with("review.weekly_day", &"mon").review_weekly_day,
        WeeklyDay::Mon
    );
}

#[test]
fn review_settings_round_trip() {
    let mut s = service();
    let all = Settings {
        review_focus_goal_hours: 6,
        notify_shutdown_due: true,
        notify_weekly_review: true,
        review_shutdown_time: 1200,
        review_weekly_day: WeeklyDay::Sun,
        ..Settings::default()
    };
    s.set_settings(all.clone(), T0).expect("saves");
    assert_eq!(s.settings(), all);
    assert_eq!(relaunch(&mut s, T0).settings(), all);
}

#[test]
fn review_settings_write_only_the_changed_keys() {
    let mut s = service();
    let next = Settings {
        review_focus_goal_hours: 4,
        ..Settings::default()
    };
    s.set_settings(next, T0).expect("saves");
    let has = |key: &'static str| -> bool {
        db(&s)
            .read(|txn| orasenda_store::settings::get::<serde_json::Value>(txn, key))
            .expect("reads")
            .is_some()
    };
    assert!(has("review.focus_goal_hours"));
    for key in [
        "review.shutdown_time",
        "notify.shutdown_due",
        "notify.weekly_review",
        "review.weekly_day",
    ] {
        assert!(!has(key), "{key} was written");
    }
}

#[test]
fn review_settings_refuse_out_of_range_values() {
    let mut s = service();
    for bad in [
        Settings {
            review_focus_goal_hours: 61,
            ..Settings::default()
        },
        Settings {
            review_shutdown_time: 239,
            ..Settings::default()
        },
        Settings {
            review_shutdown_time: 1440,
            ..Settings::default()
        },
    ] {
        assert!(s.set_settings(bad, T0).is_err());
    }
}
