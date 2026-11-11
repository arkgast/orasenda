//! Launch reads that failed and are still owed.

use orasenda_core::{
    EndReason, EngineState, NotificationStatus, Preset, Session, SessionId, SessionRecord,
};
use orasenda_store::active_session;

use super::super::*;
use super::helpers::*;
use super::support::*;
use crate::ipc::{MilestoneKind, Settings, StoreStatus, Theme};

fn row_a() -> SessionRecord {
    // `has_row` probes by id only.
    SessionRecord {
        id: SessionId("a".into()),
        preset: Preset::Classic,
        phase: orasenda_core::Phase::Focus,
        planned_ms: CLASSIC_MS,
        started_ms: T0,
        ended_ms: T0,
        paused_total_ms: 0,
        focused_ms: 0,
        end_reason: EndReason::Stopped,
        extensions: 0,
    }
}

#[test]
fn launch_with_reads_failing_starts_idle_on_defaults_and_unavailable() {
    let mut s = relaunch_with_reads_failing(T0 + MINUTE);
    let view = s.view(T0 + MINUTE);
    assert_eq!(view.state, EngineState::Idle);
    assert_eq!(view.store, StoreStatus::Unavailable);
    assert_eq!(s.settings(), Settings::default());
    assert!(s.keep_awake.is_none());
    assert!(s.pending.is_empty());
    let still = s.tick(T0 + 2 * MINUTE);
    assert_eq!(still.view.state, EngineState::Idle);
    assert_eq!(still.view.store, StoreStatus::Unavailable);
    db(&s).fail_reads(false);
    assert!(
        snapshot(db(&s)).is_some(),
        "the unread row is left in place"
    );
}

/// Each launch read marks the store unavailable on its own: only the settings read
/// fails here, the snapshot read succeeds.
#[test]
fn failed_settings_read_alone_shows_the_store_unavailable() {
    let mut s = service();
    let read = failing_read(&s, read_settings);
    s.load_settings(read);
    assert!(s.recover_owed.settings);
    assert!(!s.recover_owed.snapshot);
    assert_eq!(s.view(T0).store, StoreStatus::Unavailable);
    assert_eq!(
        s.tick(T0 + 1).view.store,
        StoreStatus::Ok,
        "the retried read succeeds"
    );
}

/// Only the snapshot read fails here; the settings read succeeded.
#[test]
fn failed_snapshot_read_alone_shows_the_store_unavailable() {
    let mut s = service();
    let read = failing_read(&s, active_session::get::<Session>);
    assert!(!s.recover(read, T0));
    assert!(s.recover_owed.snapshot);
    assert!(!s.recover_owed.settings);
    assert_eq!(s.view(T0).store, StoreStatus::Unavailable);
    assert_eq!(
        s.tick(T0 + 1).view.store,
        StoreStatus::Ok,
        "the retried read succeeds"
    );
}

#[test]
fn reads_recover_and_the_next_tick_runs_recovery() {
    let mut s = relaunch_with_reads_failing(T0 + MINUTE);
    db(&s).fail_reads(false);
    let effects = s.tick(T0 + 2 * MINUTE);
    assert_eq!(effects.view.store, StoreStatus::Ok);
    assert_eq!(effects.view.state, EngineState::Running);
    assert_eq!(effects.view.session_id, Some(SessionId("a".into())));
    assert_eq!(effects.view.remaining_ms, CLASSIC_MS - 2 * MINUTE);
    assert!(s.keep_awake.is_some());
    assert_eq!(s.settings().preset, Preset::FiftyTen);

    let mut late = relaunch_with_reads_failing(T0 + MINUTE);
    db(&late).fail_reads(false);
    let effects = late.tick(T0 + 60 * MINUTE);
    assert_eq!(effects.view.store, StoreStatus::Ok);
    assert_eq!(effects.view.state, EngineState::Idle);
    assert_eq!(
        late.pending,
        [milestone(
            MilestoneKind::Recovered,
            Some(EndReason::Completed),
            "a"
        )]
    );
    assert!(has_row(db(&late), &row_a()));
    assert_eq!(snapshot(db(&late)), None);
}

/// A store with no session and FiftyTen settings, opened again with reads failing:
/// idle and unavailable.
fn relaunch_idle_with_reads_failing() -> SessionService {
    let mut s = service();
    s.set_settings(
        Settings {
            theme: Theme::System,
            preset: Preset::FiftyTen,
            ..Settings::default()
        },
        T0,
    )
    .expect("settings save");
    let store = s.store.take().expect("store");
    store.fail_reads(true);
    SessionService::new(
        Ok(store),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    )
}

/// Item 2 of #104: a retried read that brings the status back to `ok` while idle marks
/// the store as changed; a tick that changes nothing does not.
#[test]
fn idle_read_retry_back_to_ok_flags_the_store_change() {
    let mut s = relaunch_idle_with_reads_failing();
    let failing = s.tick(T0 + 1_000);
    assert_eq!(failing.view.store, StoreStatus::Unavailable);
    assert!(!failing.store_changed);
    db(&s).fail_reads(false);
    let back = s.tick(T0 + 2_000);
    assert!(back.was_idle);
    assert_eq!(back.view.state, EngineState::Idle);
    assert_eq!(back.view.store, StoreStatus::Ok);
    assert!(back.store_changed);
    assert!(!s.tick(T0 + 3_000).store_changed);
}

/// Item 3 of #104: the same for an idle flush that succeeds (`snapshot_dirty` after a
/// failed stop). The stop itself, a command, leaves the flag false.
#[test]
fn idle_flush_back_to_ok_flags_the_store_change() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    db(&s).fail_writes(true);
    let stopped = s.apply(Action::Stop, T0 + MINUTE, id("x"));
    assert_eq!(stopped.view.store, StoreStatus::Unavailable);
    assert!(!stopped.store_changed, "commands leave it false");
    assert!(!s.tick(T0 + MINUTE + 1_000).store_changed, "still failing");
    db(&s).fail_writes(false);
    let flushed = s.tick(T0 + MINUTE + 2_000);
    assert!(flushed.was_idle);
    assert_eq!(flushed.view.state, EngineState::Idle);
    assert_eq!(flushed.view.store, StoreStatus::Ok);
    assert!(flushed.store_changed);
}

/// A `recovered` event that a retried read creates after the webview has drained
/// `pending` goes out as a `timer-milestone` on that tick, once: a later `timer_state`
/// (Today mounting again) does not hand it out a second time.
#[test]
fn late_recovered_event_is_emitted_once_the_webview_listens() {
    let Fakes { log, notifier, .. } = fakes(NotificationStatus::Denied, false);
    let host = TestHost::with(relaunch_with_reads_failing(T0 + 60 * MINUTE), log, notifier);
    host.set_now(T0 + 60 * MINUTE);
    assert!(run_state(&host).pending.is_empty());
    db(&lock(&host.0.service)).fail_reads(false);
    host.log().take();
    host.set_now(T0 + 61 * MINUTE);
    crate::scheduler::iterate(&host);
    let recovered = Event::Milestone(milestone(
        MilestoneKind::Recovered,
        Some(EndReason::Completed),
        "a",
    ));
    assert_eq!(host.log().count(|event| *event == recovered), 1);
    assert!(run_state(&host).pending.is_empty(), "not handed out again");
}

/// A start that records the unread row after the webview has listened is a transition,
/// which dismisses one-shot notices anyway: the row is recorded, but its `recovered`
/// event is neither emitted behind `started` nor kept for a later `timer_state`.
#[test]
fn row_recorded_by_a_start_after_the_webview_listens_is_not_announced() {
    let mut s = relaunch_with_reads_failing(T0 + MINUTE);
    let (state, _) = s.state(T0 + MINUTE);
    assert!(state.pending.is_empty());
    let started = s.apply(start(Preset::Classic), T0 + 3 * MINUTE, id("b"));
    assert_eq!(
        started.milestones,
        [milestone(MilestoneKind::Started, None, "b")]
    );
    assert!(s.pending.is_empty());
    db(&s).fail_reads(false);
    assert!(has_row(db(&s), &row_a()), "the row is still recorded");
}

#[test]
fn start_while_row_unread_then_flush_records_the_pre_quit_session() {
    let mut s = relaunch_with_reads_failing(T0 + MINUTE);
    db(&s).fail_writes(true);
    let started = s.apply(start(Preset::Classic), T0 + 3 * MINUTE, id("b"));
    assert_eq!(started.result, Ok(started.view.clone()));
    assert_eq!(started.view.store, StoreStatus::Unavailable);
    db(&s).fail_reads(false);
    db(&s).fail_writes(false);
    let flushed = s.tick(T0 + 4 * MINUTE);
    assert_eq!(flushed.view.store, StoreStatus::Ok);
    assert_eq!(flushed.view.session_id, Some(SessionId("b".into())));
    assert!(has_row(db(&s), &row_a()));
    assert_eq!(
        snapshot(db(&s)).and_then(|session| session.view(T0).session_id),
        Some(SessionId("b".into()))
    );
    assert_eq!(
        s.pending,
        [milestone(
            MilestoneKind::Recovered,
            Some(EndReason::Stopped),
            "a"
        )]
    );
    let back = relaunch(&mut s, T0 + 5 * MINUTE);
    assert_eq!(
        back.view(T0 + 5 * MINUTE).session_id,
        Some(SessionId("b".into()))
    );
}

#[test]
fn start_while_row_unread_records_a_finished_pre_quit_session_as_completed() {
    let mut s = relaunch_with_reads_failing(T0 + 60 * MINUTE);
    let started = s.apply(start(Preset::Classic), T0 + 60 * MINUTE, id("b"));
    assert_eq!(started.view.state, EngineState::Running);
    assert_eq!(
        s.pending,
        [milestone(
            MilestoneKind::Recovered,
            Some(EndReason::Completed),
            "a"
        )]
    );
    db(&s).fail_reads(false);
    assert!(has_row(db(&s), &row_a()));
    assert_eq!(
        snapshot(db(&s)).and_then(|session| session.view(T0).session_id),
        Some(SessionId("b".into()))
    );
    // Settings are still owed; the next tick reads them and the status returns to ok.
    let next = s.tick(T0 + 61 * MINUTE);
    assert_eq!(next.view.store, StoreStatus::Ok);
    assert_eq!(s.settings().preset, Preset::FiftyTen);
}

#[test]
fn settings_saved_while_unread_win_over_stored_ones() {
    let mut s = relaunch_with_reads_failing(T0 + 60 * MINUTE);
    let chosen = Settings {
        theme: Theme::System,
        preset: Preset::DeepBlock,
        ..Settings::default()
    };
    s.set_settings(chosen.clone(), T0 + 60 * MINUTE)
        .expect("writes still work");
    db(&s).fail_reads(false);
    s.tick(T0 + 61 * MINUTE);
    assert_eq!(s.settings(), chosen);
    assert_eq!(s.view(T0 + 61 * MINUTE).store, StoreStatus::Ok);
}
