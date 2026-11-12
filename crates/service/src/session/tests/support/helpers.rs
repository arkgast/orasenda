//! Helpers shared by the session tests.

use std::time::Duration;

use orasenda_core::{EndReason, NotificationStatus, Session, SessionId, SessionRecord};
use orasenda_store::{Store, StoreError, Txn, active_session, focus_sessions, meta, settings};

use super::fakes::*;
use crate::api::{
    MilestoneEvent, MilestoneKind, Settings, Theme, TimerCommandErrorKind, TimerView,
};
use crate::session::*;

pub(crate) const WAIT: Duration = Duration::from_secs(10);
/// How long a blocked thread is watched to show it has not moved on.
pub(crate) const STILL_BLOCKED: Duration = Duration::from_millis(300);

pub(crate) fn milestone(
    kind: MilestoneKind,
    reason: Option<EndReason>,
    id: &str,
) -> MilestoneEvent {
    MilestoneEvent {
        kind,
        end_reason: reason,
        session_id: Some(SessionId(id.into())),
    }
}

pub(crate) fn kind(effects: &Effects) -> Option<TimerCommandErrorKind> {
    effects.result.as_ref().err().map(|error| error.kind)
}

pub(crate) fn snapshot(store: &Store) -> Option<Session> {
    store
        .read(active_session::get::<Session>)
        .expect("snapshot reads")
}

/// Whether `record`'s row exists: inserting it again fails only when it does. The probe
/// always rolls back.
pub(crate) fn has_row(store: &Store, record: &SessionRecord) -> bool {
    let probe: Result<(), StoreError> =
        store.write(T0, |txn| match focus_sessions::insert(txn, record) {
            Ok(()) => Err(StoreError::Json("absent".into())),
            Err(error) => Err(error),
        });
    match probe {
        Err(StoreError::Json(message)) if message == "absent" => false,
        Err(StoreError::Sqlite(message)) => {
            assert!(
                message.contains("UNIQUE"),
                "unexpected probe error: {message}"
            );
            true
        }
        other => panic!("unexpected probe result: {other:?}"),
    }
}

pub(crate) fn relaunch(service: &mut SessionService, now_ms: u64) -> SessionService {
    let store = service.store.take().expect("the service has a store");
    SessionService::new(
        Ok(store),
        fakes(NotificationStatus::NotDetermined, false).platform,
        now_ms,
    )
}

pub(crate) fn ended_record(effects: &Effects) -> SessionRecord {
    effects.ended.clone().expect("a session ended")
}

pub(crate) fn marker(s: &SessionService) -> Option<String> {
    db(s)
        .read(|txn| meta::get(txn, META_NOTIFY_REVIEW))
        .expect("reads")
}

/// One launch read with the store failing reads; the next read succeeds.
pub(crate) fn failing_read<T>(
    s: &SessionService,
    read: impl FnOnce(&Txn) -> Result<T, StoreError>,
) -> Result<T, StoreError> {
    db(s).fail_reads(true);
    let result = db(s).read(read);
    db(s).fail_reads(false);
    assert!(result.is_err(), "the hook fails the read");
    result
}

/// Settings that select Deep Work.
pub(crate) fn deep_work() -> Settings {
    Settings {
        preset_id: default_id(2),
        ..Settings::default()
    }
}

/// A seeded store: a service has opened it once, so the preset library is in place and the
/// seed marker is gone.
pub(crate) fn seeded_store() -> Store {
    service().store.take().expect("the service has a store")
}

/// A pre-B store: the review marker pending and `notify.session_end` as given.
pub(crate) fn pending_store(stored: Option<bool>) -> Store {
    let store = memory_store();
    store.put_meta_for_tests(META_NOTIFY_REVIEW, "pending");
    if let Some(value) = stored {
        store
            .write(0, |txn| settings::set(txn, KEY_NOTIFY, &value))
            .expect("seeds notify");
    }
    store
}

/// [`read_owed_service`] with `theme` stored as `ui.theme`.
pub(crate) fn read_owed_service_with_theme(theme: Theme) -> (SessionService, usize) {
    let store = seeded_store();
    store.put_meta_for_tests(META_NOTIFY_REVIEW, "pending");
    store
        .write(0, |txn| {
            settings::set(txn, KEY_NOTIFY, &true)?;
            if theme != Theme::System {
                settings::set(txn, KEY_THEME, &theme)?;
            }
            settings::set(txn, KEY_PRESET, &default_id(2))
        })
        .expect("seeds");
    let before = store.change_log_ids().len();
    store.fail_reads(true);
    let mut s = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::Granted, false).platform,
        T0,
    );
    // Only the settings read is under test: the library is taken as loaded (core's defaults
    // are the stored ones).
    s.recover_owed.presets = false;
    (s, before)
}

/// A store holding Deep Work settings and a running session `a` started at `T0`, opened
/// again with reads failing.
pub(crate) fn relaunch_with_reads_failing(now_ms: u64) -> SessionService {
    let mut s = service();
    s.apply(start(), T0, id("a"));
    s.set_settings(deep_work(), T0).expect("settings save");
    let store = s.store.take().expect("store");
    store.fail_reads(true);
    SessionService::new(
        Ok(store),
        fakes(NotificationStatus::NotDetermined, false).platform,
        now_ms,
    )
}

pub(crate) fn settings_events(host: &TestHost) -> Vec<Settings> {
    host.log()
        .take()
        .into_iter()
        .filter_map(|e| match e {
            Event::SettingsChanged(s) => Some(s),
            _ => None,
        })
        .collect()
}

pub(crate) fn stored_notify(s: &SessionService) -> Option<bool> {
    db(s)
        .read(|txn| settings::get(txn, KEY_NOTIFY))
        .expect("reads")
}

pub(crate) fn tick_views(events: &[Event]) -> Vec<TimerView> {
    events
        .iter()
        .filter_map(|e| match e {
            Event::Tick(v) => Some(v.clone()),
            _ => None,
        })
        .collect()
}
