//! Transitions, views and keep-awake.

use orasenda_core::{
    CustomSpec, EndReason, EngineState, NotificationStatus, Preset, QUICK_START_MS, SessionId,
    format_clock, format_remaining, spoken_remaining,
};
use orasenda_store::OpenError;

use super::super::*;
use super::helpers::*;
use super::support::*;
use crate::ipc::{
    MilestoneKind, Mode, Settings, StartRequest, StoreStatus, Theme, TimerCommandErrorKind,
};

#[test]
fn start_pause_resume_stop_transitions_and_milestone_order() {
    let mut s = service();
    let started = s.apply(start(Preset::Classic), T0, id("a"));
    assert!(started.was_idle);
    assert_eq!(started.result, Ok(started.view.clone()));
    assert_eq!(started.view.state, EngineState::Running);
    assert_eq!(
        started.milestones,
        [milestone(MilestoneKind::Started, None, "a")]
    );

    let again = s.apply(start(Preset::Classic), T0 + 1, id("b"));
    assert_eq!(kind(&again), Some(TimerCommandErrorKind::AlreadyRunning));
    assert!(again.milestones.is_empty());
    assert_eq!(again.view.session_id, Some(SessionId("a".into())));

    let paused = s.apply(Action::Pause, T0 + MINUTE, id("x"));
    assert_eq!(paused.view.state, EngineState::Paused);
    assert_eq!(
        paused.milestones,
        [milestone(MilestoneKind::Paused, None, "a")]
    );
    let twice = s.apply(Action::Pause, T0 + MINUTE, id("x"));
    assert_eq!(kind(&twice), Some(TimerCommandErrorKind::WrongState));
    assert_eq!(twice.view.state, EngineState::Paused);

    let resumed = s.apply(Action::Resume, T0 + 2 * MINUTE, id("x"));
    assert_eq!(resumed.view.state, EngineState::Running);
    assert_eq!(
        resumed.milestones,
        [milestone(MilestoneKind::Resumed, None, "a")]
    );
    assert_eq!(
        resumed.view.finish,
        Some(format_clock(T0 + CLASSIC_MS + MINUTE, OFFSET_MIN, CYCLE))
    );
    let resume_running = s.apply(Action::Resume, T0 + 2 * MINUTE, id("x"));
    assert_eq!(
        kind(&resume_running),
        Some(TimerCommandErrorKind::WrongState)
    );

    let stopped = s.apply(Action::Stop, T0 + 3 * MINUTE, id("x"));
    assert_eq!(stopped.result, Ok(stopped.view.clone()));
    assert_eq!(stopped.view.state, EngineState::Idle);
    assert_eq!(
        stopped.milestones,
        [milestone(
            MilestoneKind::Ended,
            Some(EndReason::Stopped),
            "a"
        )]
    );
    let record = ended_record(&stopped);
    assert_eq!(record.end_reason, EndReason::Stopped);
    assert_eq!(record.focused_ms, 2 * MINUTE);
    assert_eq!(record.paused_total_ms, MINUTE);
    assert!(has_row(db(&s), &record));
    assert_eq!(snapshot(db(&s)), None);

    for action in [Action::Stop, Action::Pause, Action::Resume] {
        let idle = s.apply(action, T0 + 4 * MINUTE, id("x"));
        assert_eq!(kind(&idle), Some(TimerCommandErrorKind::NothingRunning));
        assert!(idle.milestones.is_empty());
    }
}

#[test]
fn quick_start_uses_quick_start_ms_and_records_quick() {
    let mut s = service();
    let started = s.apply(start(Preset::Quick), T0, id("q"));
    assert_eq!(started.view.remaining_ms, QUICK_START_MS);
    assert_eq!(started.view.preset, Some(Preset::Quick));
    let ended = s.tick(T0 + QUICK_START_MS);
    let record = ended_record(&ended);
    assert_eq!(record.preset, Preset::Quick);
    assert_eq!(record.planned_ms, QUICK_START_MS);
    assert_eq!(record.end_reason, EndReason::Completed);
    assert!(has_row(db(&s), &record));
}

#[test]
fn custom_start_without_spec_uses_saved_custom() {
    let mut s = service();
    let saved = Settings {
        theme: Theme::System,
        preset: Preset::Custom,
        custom: CustomSpec {
            focus_min: 30,
            break_min: 5,
        },
        notify_session_end: true,
    };
    s.set_settings(saved, T0).expect("settings save");
    let started = s.apply(start(Preset::Custom), T0, id("c"));
    assert_eq!(started.view.remaining_ms, 30 * MINUTE);
    s.apply(Action::Stop, T0 + 1, id("x"));

    let given = s.apply(
        Action::Start(StartRequest {
            preset: Preset::Custom,
            custom: Some(CustomSpec {
                focus_min: 20,
                break_min: 5,
            }),
        }),
        T0 + 2,
        id("d"),
    );
    assert_eq!(given.view.remaining_ms, 20 * MINUTE);
    s.apply(Action::Stop, T0 + 3, id("x"));

    let out_of_range = s.apply(
        Action::Start(StartRequest {
            preset: Preset::Custom,
            custom: Some(CustomSpec {
                focus_min: 4,
                break_min: 5,
            }),
        }),
        T0 + 4,
        id("e"),
    );
    assert_eq!(
        kind(&out_of_range),
        Some(TimerCommandErrorKind::InvalidSpec)
    );
    assert_eq!(out_of_range.view.state, EngineState::Idle);
}

#[test]
fn non_custom_start_ignores_given_custom() {
    let given = Some(CustomSpec {
        focus_min: 10,
        break_min: 5,
    });
    for (preset, expected) in [
        (Preset::Classic, CLASSIC_MS),
        (Preset::FiftyTen, 50 * MINUTE),
        (Preset::DeepBlock, 90 * MINUTE),
        (Preset::Quick, QUICK_START_MS),
    ] {
        let mut s = service();
        let started = s.apply(
            Action::Start(StartRequest {
                preset,
                custom: given,
            }),
            T0,
            id("a"),
        );
        assert_eq!(started.view.remaining_ms, expected, "{preset:?}");
        assert_eq!(started.view.preset, Some(preset));
    }
}

#[test]
fn view_mode_is_derived_from_engine_state() {
    let mut s = service();
    let idle = s.view(T0);
    assert_eq!((idle.state, idle.mode), (EngineState::Idle, Mode::Idle));
    assert_eq!(idle.remaining, "00:00");
    assert_eq!(idle.remaining_label, "0 seconds");

    s.apply(start(Preset::Classic), T0, id("a"));
    let running = s.view(T0 + 1);
    assert_eq!(
        (running.state, running.mode),
        (EngineState::Running, Mode::Focus)
    );
    assert_eq!(running.remaining_ms, CLASSIC_MS - 1);
    assert_eq!(running.remaining, format_remaining(CLASSIC_MS - 1));
    assert_eq!(running.remaining_label, spoken_remaining(CLASSIC_MS - 1));
    assert_eq!(running.remaining, "25:00");

    s.apply(Action::Pause, T0 + MINUTE, id("x"));
    let paused = s.view(T0 + 2 * MINUTE);
    assert_eq!(
        (paused.state, paused.mode),
        (EngineState::Paused, Mode::Paused)
    );
    assert_eq!(paused.remaining, "24:00");
    assert_eq!(paused.remaining_label, "24 minutes");
}

#[test]
fn finish_is_null_while_paused_and_formatted_while_running() {
    let mut s = service();
    assert_eq!(s.view(T0).finish, None);
    s.apply(start(Preset::Classic), T0, id("a"));
    assert_eq!(
        s.view(T0).finish,
        Some(format_clock(T0 + CLASSIC_MS, OFFSET_MIN, CYCLE))
    );
    assert_eq!(s.view(T0).finish.as_deref(), Some("1:25 AM"));
    s.apply(Action::Pause, T0 + MINUTE, id("x"));
    assert_eq!(s.view(T0 + MINUTE).finish, None);
}

#[test]
fn idle_finish_null_while_running_and_formatted_while_idle() {
    let mut s = service();
    let idle = s.clock_tick(T0);
    assert_eq!(idle.epoch_ms, T0);
    assert_eq!(idle.clock, format_clock(T0, OFFSET_MIN, CYCLE));
    assert_eq!(
        idle.idle_finish,
        Some(format_clock(T0 + CLASSIC_MS, OFFSET_MIN, CYCLE))
    );
    s.apply(start(Preset::Classic), T0, id("a"));
    assert_eq!(s.clock_tick(T0 + 1).idle_finish, None);
    s.apply(Action::Pause, T0 + 2, id("x"));
    assert_eq!(s.clock_tick(T0 + 3).idle_finish, None);
}

#[test]
fn pause_after_planned_end_completes_at_planned_end_and_returns_nothing_running() {
    let Fakes { platform, log, .. } = fakes(NotificationStatus::Granted, false);
    let mut s = SessionService::new(Ok(memory_store()), platform, T0);
    s.set_settings(
        Settings {
            notify_session_end: true,
            ..s.settings()
        },
        T0,
    )
    .expect("turns notifications on");
    s.apply(start(Preset::Classic), T0, id("a"));
    let late = s.apply(Action::Pause, T0 + CLASSIC_MS + 5_000, id("x"));
    assert_eq!(kind(&late), Some(TimerCommandErrorKind::NothingRunning));
    assert!(!late.was_idle);
    assert_eq!(late.view.state, EngineState::Idle);
    assert_eq!(
        late.milestones,
        [milestone(
            MilestoneKind::Ended,
            Some(EndReason::Completed),
            "a"
        )]
    );
    let record = ended_record(&late);
    assert_eq!(record.ended_ms, T0 + CLASSIC_MS);
    assert_eq!(record.end_reason, EndReason::Completed);
    assert!(late.notify_session_end);
    assert!(late.drop_after_unlock.is_some(), "the guard is handed out");
    assert_eq!(
        log.count(|e| *e == Event::Released),
        0,
        "not dropped inside"
    );
    assert_eq!(log.count(|e| matches!(e, Event::Posted(..))), 0);
    assert!(has_row(db(&s), &record));
    assert_eq!(snapshot(db(&s)), None);
    drop(late);
    assert_eq!(log.count(|e| *e == Event::Released), 1);
}

#[test]
fn stop_after_planned_end_records_completed() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    let late = s.apply(Action::Stop, T0 + 2 * CLASSIC_MS, id("x"));
    assert_eq!(kind(&late), Some(TimerCommandErrorKind::NothingRunning));
    let record = ended_record(&late);
    assert_eq!(record.end_reason, EndReason::Completed);
    assert_eq!(record.ended_ms, T0 + CLASSIC_MS);
    assert_eq!(record.focused_ms, CLASSIC_MS);
    assert_eq!(late.view.state, EngineState::Idle);
}

#[test]
fn start_after_planned_end_publishes_ended_then_started() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    let late = s.apply(start(Preset::Classic), T0 + CLASSIC_MS, id("b"));
    assert_eq!(late.result, Ok(late.view.clone()));
    assert_eq!(
        late.milestones,
        [
            milestone(MilestoneKind::Ended, Some(EndReason::Completed), "a"),
            milestone(MilestoneKind::Started, None, "b"),
        ]
    );
    assert_eq!(late.view.session_id, Some(SessionId("b".into())));
    assert!(late.drop_after_unlock.is_some());
    assert_eq!(
        snapshot(db(&s)).and_then(|session| session.view(T0).session_id),
        Some(SessionId("b".into()))
    );
}

#[test]
fn state_after_planned_end_completes_and_reports_idle() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    let (state, effects) = s.state(T0 + CLASSIC_MS + 1);
    assert_eq!(state.view.state, EngineState::Idle);
    assert!(state.pending.is_empty());
    assert_eq!(effects.result, Ok(effects.view.clone()));
    assert_eq!(
        effects.milestones,
        [milestone(
            MilestoneKind::Ended,
            Some(EndReason::Completed),
            "a"
        )]
    );
    assert!(has_row(db(&s), &ended_record(&effects)));
}

#[test]
fn timer_state_drains_pending() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    let mut back = relaunch(&mut s, T0 + 60 * MINUTE);
    let (first, effects) = back.state(T0 + 60 * MINUTE);
    assert_eq!(
        first.pending,
        [milestone(
            MilestoneKind::Recovered,
            Some(EndReason::Completed),
            "a"
        )]
    );
    assert!(effects.milestones.is_empty(), "recovered is never emitted");
    let (second, _) = back.state(T0 + 60 * MINUTE);
    assert!(second.pending.is_empty());
}

#[test]
fn start_with_failing_put_runs_and_marks_dirty() {
    let mut s = service();
    db(&s).fail_writes(true);
    let started = s.apply(start(Preset::Classic), T0, id("a"));
    assert_eq!(started.result, Ok(started.view.clone()));
    assert_eq!(started.view.state, EngineState::Running);
    assert_eq!(started.view.store, StoreStatus::Unavailable);
    assert!(s.snapshot_dirty);
    assert_eq!(snapshot(db(&s)), None);
}

#[test]
fn degraded_service_runs_the_engine_in_memory() {
    let mut s = SessionService::new(
        Err(OpenError::Sqlite("corrupt".into())),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    let started = s.apply(start(Preset::Classic), T0, id("a"));
    assert_eq!(started.view.state, EngineState::Running);
    assert_eq!(started.view.store, StoreStatus::Unavailable);
    let stopped = s.apply(Action::Stop, T0 + MINUTE, id("x"));
    assert_eq!(stopped.view.state, EngineState::Idle);
}

#[test]
fn keep_awake_begun_on_start_and_guard_returned_on_end() {
    let Fakes { platform, log, .. } = fakes(NotificationStatus::Granted, false);
    let mut s = SessionService::new(Ok(memory_store()), platform, T0);
    s.set_settings(
        Settings {
            notify_session_end: true,
            ..s.settings()
        },
        T0,
    )
    .expect("turns notifications on");
    s.apply(start(Preset::Classic), T0, id("a"));
    assert_eq!(log.count(|e| *e == Event::Begun), 1);
    assert!(s.keep_awake.is_some());
    let stopped = s.apply(Action::Stop, T0 + MINUTE, id("x"));
    assert!(s.keep_awake.is_none());
    assert!(stopped.drop_after_unlock.is_some());
    assert_eq!(log.count(|e| *e == Event::Released), 0);
    drop(stopped);
    assert_eq!(log.count(|e| *e == Event::Released), 1);

    s.apply(start(Preset::Classic), T0 + 2 * MINUTE, id("b"));
    let ended = s.tick(T0 + 2 * MINUTE + CLASSIC_MS);
    assert!(ended.drop_after_unlock.is_some());
    assert!(ended.notify_session_end);
}

#[test]
fn keep_awake_failure_is_logged_and_start_proceeds() {
    let Fakes { platform, log, .. } = fakes(NotificationStatus::Granted, true);
    let mut s = SessionService::new(Ok(memory_store()), platform, T0);
    let started = s.apply(start(Preset::Classic), T0, id("a"));
    assert_eq!(started.result, Ok(started.view.clone()));
    assert_eq!(started.view.state, EngineState::Running);
    assert!(s.keep_awake.is_none());
    assert_eq!(log.count(|e| *e == Event::Begun), 0);
    let stopped = s.apply(Action::Stop, T0 + MINUTE, id("x"));
    assert!(stopped.drop_after_unlock.is_none());
}
