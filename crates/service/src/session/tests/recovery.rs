//! Relaunch recovery and failing writes.

use std::sync::mpsc::{RecvTimeoutError, channel};
use std::thread;

use orasenda_core::{EndReason, EngineState, NotificationStatus, Preset, SessionId, SessionRecord};
use orasenda_store::{WriteGate, active_session};

use super::super::test_support::*;
use super::super::*;
use crate::api::{MilestoneKind, StoreStatus, TimerCommandErrorKind};

#[test]
fn recovers_running_snapshot_in_time() {
    // Wall-clock continuation by design (case a of #121): a relaunch before the planned end keeps running.
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    let Fakes { platform, log, .. } = fakes(NotificationStatus::NotDetermined, false);
    let store = s.store.take().expect("store");
    let mut back = SessionService::new(Ok(store), platform, T0 + MINUTE);
    let view = back.view(T0 + MINUTE);
    assert_eq!(view.state, EngineState::Running);
    assert_eq!(view.session_id, Some(SessionId("a".into())));
    assert_eq!(view.remaining_ms, CLASSIC_MS - MINUTE);
    assert_eq!(log.count(|e| *e == Event::Begun), 1);
    assert!(back.keep_awake.is_some());
    assert!(back.state(T0 + MINUTE).0.pending.is_empty());
}

#[test]
fn recovers_running_snapshot_past_end_as_completed_with_pending_recovered() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    let mut back = relaunch(&mut s, T0 + 60 * MINUTE);
    assert_eq!(back.view(T0 + 60 * MINUTE).state, EngineState::Idle);
    assert_eq!(back.store_status, StoreStatus::Ok);
    assert_eq!(
        back.pending,
        [milestone(
            MilestoneKind::Recovered,
            Some(EndReason::Completed),
            "a"
        )]
    );
    assert!(back.unsaved.is_empty());
    assert!(back.keep_awake.is_none());
    let record = SessionRecord {
        id: SessionId("a".into()),
        preset: Preset::Classic,
        phase: orasenda_core::Phase::Focus,
        planned_ms: CLASSIC_MS,
        started_ms: T0,
        ended_ms: T0 + CLASSIC_MS,
        paused_total_ms: 0,
        focused_ms: CLASSIC_MS,
        end_reason: EndReason::Completed,
        extensions: 0,
    };
    assert!(has_row(db(&back), &record));
    assert_eq!(snapshot(db(&back)), None);
    // A later tick finds nothing owed and writes nothing.
    let effects = back.tick(T0 + 61 * MINUTE);
    assert!(effects.milestones.is_empty());
}

#[test]
fn recovery_with_failing_write_keeps_record_unsaved() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    let store = s.store.take().expect("store");
    store.fail_writes(true);
    let mut back = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0 + 60 * MINUTE,
    );
    assert_eq!(back.unsaved.len(), 1);
    assert_eq!(back.unsaved[0].ended_ms, T0 + CLASSIC_MS);
    assert!(back.snapshot_dirty);
    assert_eq!(back.view(T0).store, StoreStatus::Unavailable);
    assert_eq!(back.pending.len(), 1);

    db(&back).fail_writes(false);
    let effects = back.tick(T0 + 61 * MINUTE);
    assert_eq!(effects.view.store, StoreStatus::Ok);
    assert!(back.unsaved.is_empty());
    assert!(!back.snapshot_dirty);
    assert_eq!(snapshot(db(&back)), None);
}

#[test]
fn recovers_paused_session_as_paused() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    s.apply(Action::Pause, T0 + 10 * MINUTE, id("x"));
    let Fakes { platform, log, .. } = fakes(NotificationStatus::NotDetermined, false);
    let store = s.store.take().expect("store");
    let later = T0 + 5 * 60 * MINUTE;
    let mut back = SessionService::new(Ok(store), platform, later);
    let view = back.view(later);
    assert_eq!(view.state, EngineState::Paused);
    assert_eq!(view.remaining_ms, CLASSIC_MS - 10 * MINUTE);
    assert_eq!(view.finish, None);
    assert!(back.unsaved.is_empty());
    assert!(back.pending.is_empty());
    assert_eq!(log.count(|e| *e == Event::Begun), 1);
    let resumed = back.apply(Action::Resume, later, id("x"));
    assert_eq!(resumed.view.remaining_ms, CLASSIC_MS - 10 * MINUTE);
}

#[test]
fn clock_set_back_after_end_does_not_reopen() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    let end = s.tick(T0 + CLASSIC_MS);
    let record = ended_record(&end);
    assert_eq!(record.end_reason, EndReason::Completed);
    assert_eq!(end.view.state, EngineState::Idle);
    assert!(has_row(db(&s), &record));
    assert_eq!(snapshot(db(&s)), None);
    for earlier in [T0 + MINUTE, T0 - MINUTE, T0 + CLASSIC_MS - 1] {
        let t = s.tick(earlier);
        assert!(t.milestones.is_empty());
        assert!(t.ended.is_none());
        assert_eq!(t.view.state, EngineState::Idle);
        assert_eq!(t.view.remaining_ms, 0);
        let p = s.apply(Action::Pause, earlier, id("x"));
        assert_eq!(kind(&p), Some(TimerCommandErrorKind::NothingRunning));
        assert!(p.milestones.is_empty());
        assert!(p.ended.is_none());
        assert_eq!(p.view.state, EngineState::Idle);
        assert_eq!(snapshot(db(&s)), None);
    }
    let mut back = relaunch(&mut s, T0 + MINUTE);
    assert_eq!(back.view(T0 + MINUTE).state, EngineState::Idle);
    assert!(back.state(T0 + MINUTE).0.pending.is_empty());
    assert!(has_row(db(&back), &record));
}

#[test]
fn clock_set_back_after_stop_does_not_reopen_on_relaunch() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    let stopped = s.apply(Action::Stop, T0 + 5 * MINUTE, id("x"));
    let record = ended_record(&stopped);
    assert_eq!(record.end_reason, EndReason::Stopped);
    assert!(has_row(db(&s), &record));
    assert_eq!(snapshot(db(&s)), None);
    let mut back = relaunch(&mut s, T0 + MINUTE);
    assert_eq!(back.view(T0 + MINUTE).state, EngineState::Idle);
    assert!(back.state(T0 + MINUTE).0.pending.is_empty());
    assert_eq!(snapshot(db(&back)), None);
}

#[test]
fn undecodable_snapshot_is_logged_and_left_in_place() {
    let store = memory_store();
    store
        .write(T0, |txn| {
            active_session::put(txn, &serde_json::json!({ "state": "bogus" }))
        })
        .expect("garbage written");
    let mut s = SessionService::new(
        Ok(store),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    assert_eq!(s.view(T0).state, EngineState::Idle);
    assert_eq!(s.store_status, StoreStatus::Ok);
    assert!(!s.snapshot_dirty);
    s.tick(T0 + 1_000);
    let raw: Option<serde_json::Value> = db(&s).read(active_session::get).expect("reads");
    assert_eq!(raw, Some(serde_json::json!({ "state": "bogus" })));
}

#[test]
fn stop_with_failing_write_does_not_resurrect_on_relaunch() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    db(&s).fail_writes(true);
    let stopped = s.apply(Action::Stop, T0 + 10 * MINUTE, id("x"));
    assert_eq!(stopped.result, Ok(stopped.view.clone()));
    assert_eq!(stopped.view.store, StoreStatus::Unavailable);
    let record = ended_record(&stopped);
    assert_eq!(s.unsaved, std::slice::from_ref(&record));
    assert!(s.snapshot_dirty);

    db(&s).fail_writes(false);
    let effects = s.tick(T0 + 10 * MINUTE + 1_000);
    assert_eq!(effects.view.store, StoreStatus::Ok);
    assert!(s.unsaved.is_empty());
    assert!(!s.snapshot_dirty);
    assert!(has_row(db(&s), &record));
    assert_eq!(record.focused_ms, 10 * MINUTE);
    assert_eq!(record.end_reason, EndReason::Stopped);
    assert_eq!(snapshot(db(&s)), None);

    let mut back = relaunch(&mut s, T0 + 60 * MINUTE);
    assert_eq!(back.view(T0 + 60 * MINUTE).state, EngineState::Idle);
    assert!(back.state(T0 + 60 * MINUTE).0.pending.is_empty());
}

/// Pins a documented limit (#122, ADR-012): when no write succeeds from
/// the end through the exit flush, the start snapshot is all the store
/// has, so a relaunch before the planned end resumes the session. The
/// store is the single durable medium; nothing is journaled beside it.
#[test]
fn end_and_exit_flush_both_failing_leaves_start_snapshot_and_relaunch_resumes() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    assert!(snapshot(db(&s)).is_some());

    db(&s).fail_writes(true);
    let stopped = s.apply(Action::Stop, T0 + 5 * MINUTE, id("x"));
    let record = ended_record(&stopped);
    assert_eq!(stopped.view.store, StoreStatus::Unavailable);
    assert_eq!(stopped.view.state, EngineState::Idle);
    assert_eq!(s.unsaved, std::slice::from_ref(&record));
    assert!(s.snapshot_dirty);
    assert_eq!(record.end_reason, EndReason::Stopped);
    assert_eq!(record.focused_ms, 5 * MINUTE);

    s.flush(T0 + 5 * MINUTE);
    assert_eq!(s.unsaved, std::slice::from_ref(&record));
    assert!(s.snapshot_dirty);
    db(&s).fail_writes(false);
    assert!(!has_row(db(&s), &record));
    assert_eq!(
        snapshot(db(&s)).and_then(|session| session.view(T0).session_id),
        Some(SessionId("a".into()))
    );

    let mut back = relaunch(&mut s, T0 + 6 * MINUTE);
    let view = back.view(T0 + 6 * MINUTE);
    assert_eq!(view.state, EngineState::Running);
    assert_eq!(view.session_id, Some(SessionId("a".into())));
    assert_eq!(view.remaining_ms, CLASSIC_MS - 6 * MINUTE);
    assert!(!has_row(db(&back), &record));
    assert!(back.unsaved.is_empty());
    assert!(back.state(T0 + 6 * MINUTE).0.pending.is_empty());

    let ended = back.apply(Action::Stop, T0 + 7 * MINUTE, id("x"));
    let again = ended_record(&ended);
    assert_eq!(ended.view.store, StoreStatus::Ok);
    assert_eq!(again.end_reason, EndReason::Stopped);
    assert_eq!(again.focused_ms, 7 * MINUTE);
    assert_eq!(again.id, SessionId("a".into()));
    assert!(has_row(db(&back), &again));
    assert_eq!(snapshot(db(&back)), None);

    let mut third = relaunch(&mut back, T0 + 8 * MINUTE);
    assert_eq!(third.view(T0 + 8 * MINUTE).state, EngineState::Idle);
    assert!(third.state(T0 + 8 * MINUTE).0.pending.is_empty());
}

/// The exit flush with a store that still rejects writes leaves what is
/// owed untouched and does not panic (#122).
#[test]
fn flush_on_exit_with_failing_store_leaves_owed_state() {
    let host = TestHost::new(NotificationStatus::Denied);
    run_action_on(&host, start(Preset::Classic)).expect("starts");
    db(&lock(&host.0.service)).fail_writes(true);
    host.set_now(T0 + MINUTE);
    run_action_on(&host, Action::Stop).expect("stops");
    let (unsaved_before, dirty_before) = {
        let service = lock(&host.0.service);
        (service.unsaved.clone(), service.snapshot_dirty)
    };
    flush_on_exit(&host);
    let service = lock(&host.0.service);
    assert_eq!(service.unsaved, unsaved_before);
    assert_eq!(unsaved_before.len(), 1);
    assert_eq!(unsaved_before[0].end_reason, EndReason::Stopped);
    assert_eq!(unsaved_before[0].focused_ms, MINUTE);
    assert_eq!(service.snapshot_dirty, dirty_before);
    assert!(dirty_before);
    assert_eq!(service.view(T0 + MINUTE).store, StoreStatus::Unavailable);
    assert!(snapshot(db(&service)).is_some());
}

#[test]
fn failed_put_then_recover_keeps_live_snapshot() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    db(&s).fail_writes(true);
    let stopped = s.apply(Action::Stop, T0 + MINUTE, id("x"));
    let record_a = ended_record(&stopped);
    let started = s.apply(start(Preset::Classic), T0 + 2 * MINUTE, id("b"));
    assert_eq!(started.view.state, EngineState::Running);
    assert_eq!(started.view.store, StoreStatus::Unavailable);

    db(&s).fail_writes(false);
    let effects = s.tick(T0 + 3 * MINUTE);
    assert_eq!(effects.view.store, StoreStatus::Ok);
    assert!(has_row(db(&s), &record_a));
    assert_eq!(
        snapshot(db(&s)).and_then(|session| session.view(T0).session_id),
        Some(SessionId("b".into()))
    );

    let back = relaunch(&mut s, T0 + 4 * MINUTE);
    let view = back.view(T0 + 4 * MINUTE);
    assert_eq!(view.state, EngineState::Running);
    assert_eq!(view.session_id, Some(SessionId("b".into())));
}

#[test]
fn retry_flush_holds_lock_against_concurrent_start() {
    // `snapshot_dirty` with the engine idle: a stop whose write failed.
    let Fakes {
        platform,
        log,
        notifier,
    } = fakes(NotificationStatus::Denied, false);
    let mut s = SessionService::new(Ok(memory_store()), platform, T0);
    s.apply(start(Preset::Classic), T0, id("a"));
    db(&s).fail_writes(true);
    s.apply(Action::Stop, T0 + MINUTE, id("x"));
    assert!(s.snapshot_dirty);
    db(&s).fail_writes(false);
    let (entered_tx, entered) = channel();
    let (release, release_rx) = channel();
    db(&s).gate_writes(Some(WriteGate {
        entered: entered_tx,
        release: release_rx,
    }));
    let host = TestHost::with(s, log, notifier);
    host.set_now(T0 + 2 * MINUTE);

    let flusher = {
        let host = host.clone();
        thread::spawn(move || crate::scheduler::iterate(&host))
    };
    entered
        .recv_timeout(WAIT)
        .expect("the flush is inside its write");
    assert!(
        host.0.service.try_lock().is_err(),
        "the flush holds the lock"
    );

    let (started_tx, started_rx) = channel();
    let starter = {
        let host = host.clone();
        thread::spawn(move || {
            let result = run_action_on(&host, start(Preset::Classic));
            started_tx.send(()).expect("test is listening");
            result
        })
    };
    assert_eq!(
        started_rx.recv_timeout(STILL_BLOCKED),
        Err(RecvTimeoutError::Timeout),
        "the start waits for the lock"
    );
    assert!(host.0.service.try_lock().is_err());

    release.send(()).expect("the flush is parked");
    // The start's own write parks on the gate next.
    entered
        .recv_timeout(WAIT)
        .expect("the start is inside its write");
    release.send(()).expect("the start is parked");
    flusher.join().expect("flusher joins");
    let started = starter
        .join()
        .expect("starter joins")
        .expect("start succeeds");
    assert_eq!(started.state, EngineState::Running);

    let mut service = lock(&host.0.service);
    assert!(!service.snapshot_dirty);
    assert!(service.unsaved.is_empty());
    let stored = snapshot(db(&service)).expect("a snapshot is stored");
    assert_eq!(stored.view(T0).session_id, started.session_id);
    db(&service).gate_writes(None);
    let back = relaunch(&mut service, T0 + 3 * MINUTE);
    assert_eq!(back.view(T0 + 3 * MINUTE).session_id, started.session_id);
}

#[test]
fn store_status_across_failing_write_and_next_success() {
    let mut s = service();
    let started = s.apply(start(Preset::Classic), T0, id("a"));
    assert_eq!(started.view.store, StoreStatus::Ok);
    db(&s).fail_writes(true);
    let paused = s.apply(Action::Pause, T0 + MINUTE, id("x"));
    assert_eq!(paused.result, Ok(paused.view.clone()));
    assert_eq!(paused.view.store, StoreStatus::Unavailable);
    assert_eq!(s.tick(T0 + 2 * MINUTE).view.store, StoreStatus::Unavailable);
    db(&s).fail_writes(false);
    let resumed = s.apply(Action::Resume, T0 + 3 * MINUTE, id("x"));
    assert_eq!(resumed.view.store, StoreStatus::Ok);
    assert!(!s.snapshot_dirty);
}

#[test]
fn end_write_failure_keeps_record_unsaved_and_next_tick_flushes_it() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    db(&s).fail_writes(true);
    let ended = s.tick(T0 + CLASSIC_MS);
    let record = ended_record(&ended);
    assert_eq!(ended.view.store, StoreStatus::Unavailable);
    assert_eq!(s.unsaved, std::slice::from_ref(&record));
    db(&s).fail_writes(false);
    let next = s.tick(T0 + CLASSIC_MS + 1_000);
    assert!(next.ended.is_none());
    assert_eq!(next.view.store, StoreStatus::Ok);
    assert!(s.unsaved.is_empty());
    assert!(has_row(db(&s), &record));
    assert_eq!(snapshot(db(&s)), None);
}

#[test]
fn flush_writes_what_is_owed() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    db(&s).fail_writes(true);
    let stopped = s.apply(Action::Stop, T0 + MINUTE, id("x"));
    db(&s).fail_writes(false);
    s.flush(T0 + 2 * MINUTE);
    assert!(s.unsaved.is_empty());
    assert!(!s.snapshot_dirty);
    assert!(has_row(db(&s), &ended_record(&stopped)));
}
