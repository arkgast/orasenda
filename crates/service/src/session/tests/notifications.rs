//! The notify review and the notification status.

use std::sync::atomic::Ordering;

use orasenda_core::{NotificationStatus, Preset, Session};
use orasenda_store::active_session;

use super::super::*;
use super::helpers::*;
use super::support::*;
use crate::ipc::{MilestoneKind, Settings, SettingsErrorKind, Theme};
use crate::scheduler;

#[test]
fn set_notifications_reports_a_visible_change_only() {
    let mut s = service();
    assert_eq!(s.notifications(), None);
    assert_eq!(s.view(T0).notifications, NotificationStatus::Unavailable);
    assert!(!s.set_notifications(NotificationStatus::Unavailable));
    assert_eq!(s.notifications(), Some(NotificationStatus::Unavailable));
    assert!(s.set_notifications(NotificationStatus::NotDetermined));
    assert!(!s.set_notifications(NotificationStatus::NotDetermined));
    assert!(s.set_notifications(NotificationStatus::Granted));
    assert_eq!(s.view(T0).notifications, NotificationStatus::Granted);
}

const ALL_STATUSES: [NotificationStatus; 4] = [
    NotificationStatus::Granted,
    NotificationStatus::Denied,
    NotificationStatus::NotDetermined,
    NotificationStatus::Unavailable,
];

fn pending_service(stored: Option<bool>) -> SessionService {
    SessionService::new(
        Ok(pending_store(stored)),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    )
}

#[test]
fn review_table() {
    for stored in [None, Some(true), Some(false)] {
        for status in ALL_STATUSES {
            let mut s = pending_service(stored);
            s.set_notifications(status);
            let wrote = s.run_notify_review(T0);
            let known = status != NotificationStatus::Unavailable;
            let outcome = stored.unwrap_or(true) && status == NotificationStatus::Granted;
            let case = format!("{stored:?} {status:?}");
            assert_eq!(wrote, known, "{case}");
            assert_eq!(s.settings().notify_session_end, outcome, "{case}");
            if known {
                assert_eq!(marker(&s), None, "{case}");
                assert_eq!(stored_notify(&s), Some(outcome), "{case}");
            } else {
                assert_eq!(marker(&s).as_deref(), Some("pending"), "{case}");
                assert_eq!(stored_notify(&s), stored, "{case}");
            }
            let rows = db(&s).change_log_ids().len();
            assert!(!s.run_notify_review(T0), "{case}: at most once");
            assert_eq!(db(&s).change_log_ids().len(), rows, "{case}");
        }
    }
}

#[test]
fn review_write_failure_keeps_marker_and_cached_value() {
    let mut s = pending_service(Some(true));
    s.set_notifications(NotificationStatus::Denied);
    db(&s).fail_writes(true);
    assert!(!s.run_notify_review(T0));
    assert!(!s.settings().notify_session_end);
    db(&s).fail_writes(false);
    assert_eq!(marker(&s).as_deref(), Some("pending"));
    assert_eq!(stored_notify(&s), Some(true));
    assert!(!s.run_notify_review(T0 + 1), "no retry in this run");
    assert_eq!(marker(&s).as_deref(), Some("pending"));
}

/// A host whose settings read failed at launch, with the review owed.
fn recovering_host(stored: Option<bool>) -> TestHost {
    let store = pending_store(stored);
    store.fail_reads(true);
    let Fakes {
        platform,
        log,
        notifier,
    } = fakes(NotificationStatus::Granted, false);
    TestHost::with(SessionService::new(Ok(store), platform, T0), log, notifier)
}

#[test]
fn review_emits_settings_changed_once_after_unlock() {
    let host = recovering_host(Some(true));
    lock(&host.0.service).set_notifications(NotificationStatus::Granted);
    db(&lock(&host.0.service)).fail_reads(false);
    host.log().take();
    scheduler::iterate(&host);
    let events = settings_events(&host);
    assert_eq!(events.len(), 1);
    assert!(events[0].notify_session_end);
    assert_eq!(host.0.under_lock.load(Ordering::SeqCst), 0);
    scheduler::iterate(&host);
    assert!(settings_events(&host).is_empty());
}

#[test]
fn review_runs_after_recovered_settings_read() {
    let store = pending_store(None);
    store.fail_reads(true);
    let mut s = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::Granted, false).platform,
        T0,
    );
    s.set_notifications(NotificationStatus::Granted);
    assert!(
        !s.run_notify_review(T0),
        "not reviewed while the settings are owed"
    );
    db(&s).fail_reads(false);
    let e = s.tick(T0 + 1);
    let presented = e.settings_changed.expect("one settings-changed is owed");
    assert!(presented.notify_session_end);
    assert_eq!(marker(&s), None);
    assert_eq!(stored_notify(&s), Some(true));
}

#[test]
fn review_waits_for_an_owed_snapshot_then_runs_in_the_recovering_tick() {
    let store = pending_store(Some(true));
    let mut first = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::Granted, false).platform,
        T0,
    );
    first.apply(start(Preset::Classic), T0, id("a"));
    let store = first.store.take().expect("store");
    store.fail_reads(true);
    let mut s = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::Granted, false).platform,
        T0 + 1,
    );
    // Only the snapshot read failed at launch.
    s.recover_owed.settings = false;
    s.review_pending = true;
    s.set_notifications(NotificationStatus::Granted);
    db(&s).fail_reads(false);
    assert!(!s.run_notify_review(T0 + 1));
    assert_eq!(marker(&s).as_deref(), Some("pending"));
    assert!(
        db(&s)
            .read(active_session::get::<Session>)
            .expect("reads")
            .is_some(),
        "the row is untouched"
    );
    let e = s.tick(T0 + 2);
    assert!(!s.engine.is_idle(), "the session resumes running");
    assert_eq!(marker(&s), None);
    assert!(e.settings_changed.is_some());
    assert_eq!(
        e.milestones
            .iter()
            .filter(|m| m.kind == MilestoneKind::Recovered)
            .count(),
        0
    );
}

#[test]
fn review_with_snapshot_recovery_in_one_retry_keeps_the_running_session() {
    let store = pending_store(Some(true));
    let mut first = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::Granted, false).platform,
        T0,
    );
    first.apply(start(Preset::Classic), T0, id("a"));
    let store = first.store.take().expect("store");
    store.fail_reads(true);
    let mut s = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::Granted, false).platform,
        T0 + 1,
    );
    s.set_notifications(NotificationStatus::Granted);
    db(&s).fail_reads(false);
    let e = s.tick(T0 + 2);
    assert!(e.settings_changed.is_some());
    assert_eq!(marker(&s), None);
    assert!(!s.engine.is_idle(), "the session resumes running");
    assert_eq!(
        e.milestones
            .iter()
            .filter(|m| m.kind == MilestoneKind::Recovered)
            .count(),
        0
    );
    assert!(
        db(&s)
            .read(active_session::get::<Session>)
            .expect("reads")
            .is_some(),
        "the active session row stays"
    );
}

#[test]
fn settings_set_without_notify_change_keeps_marker() {
    let mut s = pending_service(None);
    let before = db(&s).change_log_ids().len();
    let saved = s
        .set_settings(
            Settings {
                theme: Theme::Dark,
                ..s.settings()
            },
            T0,
        )
        .expect("saves");
    assert_eq!(saved.theme, Some(Theme::Dark));
    assert!(!saved.presented.notify_session_end);
    assert_eq!(marker(&s).as_deref(), Some("pending"));
    assert_eq!(stored_notify(&s), None);
    assert_eq!(db(&s).change_log_ids()[before..], ["ui.theme"]);
    assert!(!s.settings().notify_session_end);
    s.set_notifications(NotificationStatus::Granted);
    assert!(
        s.settings().notify_session_end,
        "the cache kept stored-or-true"
    );
}

#[test]
fn settings_set_changing_notify_clears_marker() {
    let mut s = pending_service(None);
    s.set_settings(
        Settings {
            notify_session_end: true,
            ..s.settings()
        },
        T0,
    )
    .expect("saves");
    assert_eq!(marker(&s), None);
    assert_eq!(stored_notify(&s), Some(true));
    s.set_notifications(NotificationStatus::Granted);
    assert!(s.settings().notify_session_end);
    s.set_notifications(NotificationStatus::Denied);
    assert!(!s.run_notify_review(T0));
    assert_eq!(stored_notify(&s), Some(true));

    let mut failing = pending_service(None);
    db(&failing).fail_writes(true);
    let err = failing
        .set_settings(
            Settings {
                notify_session_end: true,
                ..failing.settings()
            },
            T0,
        )
        .expect_err("write fails");
    assert_eq!(err.kind, SettingsErrorKind::Write);
    db(&failing).fail_writes(false);
    assert_eq!(marker(&failing).as_deref(), Some("pending"));
    assert_eq!(stored_notify(&failing), None);
}

#[test]
fn settings_get_presents_review_outcome_while_pending() {
    let mut s = pending_service(None);
    assert!(!s.settings().notify_session_end, "status unknown");
    s.set_notifications(NotificationStatus::Granted);
    assert!(s.settings().notify_session_end);
    assert_eq!(stored_notify(&s), None);
    assert_eq!(marker(&s).as_deref(), Some("pending"));
}
