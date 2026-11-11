use super::*;
use crate::timer::{CustomSpec, QUICK_START_MS};

const S: u64 = 1_000;
const MIN: u64 = 60 * S;
const T0: u64 = 1_794_237_600_000;

fn id(s: &str) -> SessionId {
    SessionId(s.into())
}

fn spec(p: Preset) -> PresetSpec {
    p.spec(&CustomSpec::default()).unwrap()
}

fn classic_at(now: u64) -> Session {
    let mut s = Session::default();
    s.start(id("a"), Preset::Classic, spec(Preset::Classic), now)
        .unwrap();
    s
}

fn ended(m: Option<Milestone>) -> SessionRecord {
    match m {
        Some(Milestone::Ended(r)) => r,
        other => panic!("expected Ended, got {other:?}"),
    }
}

#[test]
fn default_is_idle() {
    assert_eq!(Session::default(), Session::Idle);
    assert!(Session::default().is_idle());
    assert!(!classic_at(T0).is_idle());
    let v = Session::Idle.view(T0);
    assert_eq!(v.state, EngineState::Idle);
    assert_eq!(v.preset, None);
    assert_eq!(v.session_id, None);
    assert_eq!(v.remaining_ms, 0);
    assert_eq!(v.progress, 0.0);
    assert_eq!(v.planned_end_ms, None);
}

#[test]
fn start_pause_resume_stop_arithmetic() {
    let mut s = classic_at(T0);
    let v = s.view(T0);
    assert_eq!(v.state, EngineState::Running);
    assert_eq!(v.phase, Phase::Focus);
    assert_eq!(v.preset, Some(Preset::Classic));
    assert_eq!(v.session_id, Some(id("a")));
    assert_eq!(v.remaining_ms, 25 * MIN);
    assert_eq!(v.progress, 0.0);

    // 5 minutes in, pause for 3 minutes, then 2 more minutes.
    assert_eq!(s.view(T0 + 5 * MIN).remaining_ms, 20 * MIN);
    s.pause(T0 + 5 * MIN).unwrap();
    assert_eq!(s.view(T0 + 6 * MIN).state, EngineState::Paused);
    s.resume(T0 + 8 * MIN).unwrap();
    assert_eq!(s.view(T0 + 8 * MIN).remaining_ms, 20 * MIN);
    let v = s.view(T0 + 10 * MIN);
    assert_eq!(v.remaining_ms, 18 * MIN);
    assert_eq!(v.progress, 7.0 / 25.0);

    let r = s.stop(T0 + 10 * MIN).unwrap();
    assert_eq!(r.id, id("a"));
    assert_eq!(r.preset, Preset::Classic);
    assert_eq!(r.phase, Phase::Focus);
    assert_eq!(r.planned_ms, 25 * MIN);
    assert_eq!(r.started_ms, T0);
    assert_eq!(r.ended_ms, T0 + 10 * MIN);
    assert_eq!(r.paused_total_ms, 3 * MIN);
    assert_eq!(r.focused_ms, 7 * MIN);
    assert_eq!(r.end_reason, EndReason::Stopped);
    assert_eq!(r.extensions, 0);
    assert!(s.is_idle());
}

#[test]
fn elapsed_is_frozen_while_paused() {
    let mut s = classic_at(T0);
    s.pause(T0 + 10 * MIN).unwrap();
    for later in [
        T0 + 10 * MIN,
        T0 + 11 * MIN,
        T0 + 60 * MIN,
        T0 + 48 * 60 * MIN,
    ] {
        let v = s.view(later);
        assert_eq!(v.remaining_ms, 15 * MIN, "at {later}");
        assert_eq!(v.progress, 10.0 / 25.0);
    }
    // A clock set back while paused does not move it either.
    assert_eq!(s.view(T0).remaining_ms, 15 * MIN);
}

#[test]
fn planned_end_is_some_running_none_paused_and_moves_by_the_pause() {
    let mut s = classic_at(T0);
    assert_eq!(s.planned_end_ms(), Some(T0 + 25 * MIN));
    assert_eq!(s.view(T0).planned_end_ms, Some(T0 + 25 * MIN));
    s.pause(T0 + 5 * MIN).unwrap();
    assert_eq!(s.planned_end_ms(), None);
    assert_eq!(s.view(T0 + 6 * MIN).planned_end_ms, None);
    s.resume(T0 + 9 * MIN).unwrap();
    assert_eq!(s.planned_end_ms(), Some(T0 + 29 * MIN));
    s.pause(T0 + 10 * MIN).unwrap();
    s.resume(T0 + 11 * MIN).unwrap();
    assert_eq!(s.planned_end_ms(), Some(T0 + 30 * MIN));
    assert_eq!(s.view(T0 + 11 * MIN).planned_end_ms, Some(T0 + 30 * MIN));
    assert_eq!(Session::Idle.planned_end_ms(), None);
}

#[test]
fn late_advance_ends_at_planned_end_not_now() {
    let mut s = classic_at(T0);
    s.pause(T0 + MIN).unwrap();
    s.resume(T0 + 3 * MIN).unwrap();
    let planned_end = T0 + 27 * MIN;
    assert_eq!(s.advance(planned_end - 1), None);
    let r = ended(s.advance(planned_end + 7 * 60 * MIN));
    assert_eq!(r.ended_ms, planned_end);
    assert_eq!(r.focused_ms, 25 * MIN);
    assert_eq!(r.planned_ms, 25 * MIN);
    assert_eq!(r.paused_total_ms, 2 * MIN);
    assert_eq!(r.end_reason, EndReason::Completed);
    assert_eq!(r.extensions, 0);
    assert!(s.is_idle());

    // Exactly at the planned end also ends.
    let mut s = classic_at(T0);
    assert_eq!(ended(s.advance(T0 + 25 * MIN)).ended_ms, T0 + 25 * MIN);
}

#[test]
fn advance_on_paused_never_ends() {
    let mut s = classic_at(T0);
    s.pause(T0 + MIN).unwrap();
    let before = s.clone();
    for later in [T0 + 25 * MIN, T0 + 365 * 24 * 60 * MIN, u64::MAX] {
        assert_eq!(s.advance(later), None);
    }
    assert_eq!(s, before);
}

#[test]
fn advance_on_idle_is_none() {
    let mut s = Session::Idle;
    assert_eq!(s.advance(T0), None);
    assert_eq!(s.advance(u64::MAX), None);
    assert!(s.is_idle());
}

#[test]
fn advance_after_end_with_earlier_now_stays_idle() {
    let mut s = classic_at(T0);
    let record = ended(s.advance(T0 + 25 * MIN));
    assert_eq!(record.end_reason, EndReason::Completed);
    assert_eq!(record.ended_ms, T0 + 25 * MIN);
    for earlier in [T0 + MIN, T0, 0] {
        assert_eq!(s.advance(earlier), None, "at {earlier}");
        assert!(s.is_idle());
        let v = s.view(earlier);
        assert_eq!(v.state, EngineState::Idle);
        assert_eq!(v.remaining_ms, 0);
        assert_eq!(v.planned_end_ms, None);
        assert_eq!(s.planned_end_ms(), None);
        assert_eq!(s.pause(earlier), Err(TimerError::NothingRunning));
        assert_eq!(s.resume(earlier), Err(TimerError::NothingRunning));
        assert_eq!(s.stop(earlier), Err(TimerError::NothingRunning));
    }
    assert_eq!(s, Session::Idle);
}

#[test]
fn record_carries_the_preset_given_to_start() {
    let custom = CustomSpec {
        focus_min: 30,
        break_min: 7,
    };
    for (preset, sp) in [
        (Preset::Quick, spec(Preset::Quick)),
        (Preset::Classic, spec(Preset::Classic)),
        (Preset::Custom, Preset::Custom.spec(&custom).unwrap()),
    ] {
        let planned = sp.focus_ms;
        let mut s = Session::Idle;
        s.start(id("p"), preset, sp, T0).unwrap();
        let r = ended(s.advance(T0 + planned));
        assert_eq!(r.preset, preset);
        assert_eq!(r.planned_ms, planned);
        assert_eq!(r.focused_ms, planned);
    }
    let mut s = Session::Idle;
    s.start(id("q"), Preset::Quick, spec(Preset::Quick), T0)
        .unwrap();
    assert_eq!(s.view(T0).remaining_ms, QUICK_START_MS);
    assert_eq!(s.stop(T0 + MIN).unwrap().preset, Preset::Quick);
}

#[test]
fn elapsed_clamped_on_backward_clock_never_negative() {
    let mut s = classic_at(T0);
    // Clock set back before the start.
    let v = s.view(T0 - 10 * MIN);
    assert_eq!(v.remaining_ms, 25 * MIN);
    assert_eq!(v.progress, 0.0);
    assert_eq!(s.view(0).remaining_ms, 25 * MIN);
    assert_eq!(s.advance(0), None);
    // Remaining grows by the jump back.
    assert_eq!(s.view(T0 + 10 * MIN).remaining_ms, 15 * MIN);
    assert_eq!(s.view(T0 + 4 * MIN).remaining_ms, 21 * MIN);
    // Pause, then resume at an earlier instant: the pause adds nothing.
    s.pause(T0 + 10 * MIN).unwrap();
    s.resume(T0 + 2 * MIN).unwrap();
    assert_eq!(s.planned_end_ms(), Some(T0 + 25 * MIN));
    // Stop before the start: no focused time, and the record never ends before it starts.
    let r = s.stop(T0 - MIN).unwrap();
    assert_eq!(r.focused_ms, 0);
    assert!(r.ended_ms >= r.started_ms);
}

#[test]
fn adversarial_instants_never_panic() {
    // A restored snapshot that starts in the future, and instants near u64::MAX.
    let mut s = classic_at(u64::MAX - MIN);
    assert_eq!(s.planned_end_ms(), Some(u64::MAX));
    assert_eq!(s.view(0).remaining_ms, 25 * MIN);
    s.pause(u64::MAX).unwrap();
    s.resume(0).unwrap();
    s.pause(0).unwrap();
    s.resume(u64::MAX).unwrap();
    assert!(s.view(u64::MAX).progress <= 1.0);
    let _ = s.advance(u64::MAX);
    let mut s = Session::Paused {
        id: id("x"),
        preset: Preset::Classic,
        spec: spec(Preset::Classic),
        phase: Phase::Focus,
        started_ms: u64::MAX,
        planned_ms: u64::MAX,
        paused_total_ms: u64::MAX,
        pause_started_ms: 0,
    };
    let v = s.view(u64::MAX);
    assert!((0.0..=1.0).contains(&v.progress));
    s.resume(u64::MAX).unwrap();
    assert_eq!(s.planned_end_ms(), Some(u64::MAX));
    let _ = s.view(0);
    let _ = s.stop(u64::MAX).unwrap();
}

#[test]
fn progress_stays_in_unit_interval() {
    let s = classic_at(T0);
    for now in [
        0,
        T0 - 1,
        T0,
        T0 + 1,
        T0 + 12 * MIN,
        T0 + 25 * MIN,
        T0 + 99 * MIN,
        u64::MAX,
    ] {
        let p = s.view(now).progress;
        assert!((0.0..=1.0).contains(&p), "{p} at {now}");
    }
    assert_eq!(s.view(T0 + 99 * MIN).progress, 1.0);
    assert_eq!(s.view(T0 + 99 * MIN).remaining_ms, 0);
    // A zero-length plan (only reachable from a hand-edited snapshot) is not a NaN.
    let mut z = Session::Idle;
    let zero = PresetSpec {
        focus_ms: 0,
        ..spec(Preset::Classic)
    };
    z.start(id("z"), Preset::Custom, zero, T0).unwrap();
    let p = z.view(T0).progress;
    assert!((0.0..=1.0).contains(&p), "{p}");
}

#[test]
fn one_milestone_per_transition_none_per_tick() {
    let mut s = Session::Idle;
    assert_eq!(
        s.start(id("a"), Preset::Classic, spec(Preset::Classic), T0),
        Ok(())
    );
    for t in (0..25 * 60).map(|k| T0 + k * S) {
        assert_eq!(s.advance(t), None, "tick at {t}");
    }
    assert_eq!(s.pause(T0 + 10 * MIN), Ok(()));
    for t in (0..120).map(|k| T0 + 10 * MIN + k * S) {
        assert_eq!(s.advance(t), None);
    }
    assert_eq!(s.resume(T0 + 12 * MIN), Ok(()));
    let ending_tick = T0 + 27 * MIN;
    let mut endings = 0;
    for t in (0..60 * 60).map(|k| T0 + 12 * MIN + k * S) {
        if let Some(m) = s.advance(t) {
            assert_eq!(t, ending_tick);
            assert!(matches!(m, Milestone::Ended(_)));
            endings += 1;
        }
    }
    assert_eq!(endings, 1);
}

#[test]
fn wrong_state_for_pause_while_paused_and_resume_while_running() {
    let mut s = classic_at(T0);
    let running = s.clone();
    assert_eq!(s.resume(T0 + MIN), Err(TimerError::WrongState));
    assert_eq!(s, running);
    s.pause(T0 + MIN).unwrap();
    let paused = s.clone();
    assert_eq!(s.pause(T0 + 2 * MIN), Err(TimerError::WrongState));
    assert_eq!(s, paused);

    let mut idle = Session::Idle;
    assert_eq!(idle.pause(T0), Err(TimerError::NothingRunning));
    assert_eq!(idle.resume(T0), Err(TimerError::NothingRunning));
    assert_eq!(idle.stop(T0), Err(TimerError::NothingRunning));
    assert_eq!(idle, Session::Idle);
}

#[test]
fn start_while_running_is_already_running_and_changes_nothing() {
    let mut s = classic_at(T0);
    let running = s.clone();
    assert_eq!(
        s.start(id("b"), Preset::Quick, spec(Preset::Quick), T0 + MIN),
        Err(TimerError::AlreadyRunning)
    );
    assert_eq!(s, running);
    s.pause(T0 + MIN).unwrap();
    let paused = s.clone();
    assert_eq!(
        s.start(id("b"), Preset::Quick, spec(Preset::Quick), T0 + MIN),
        Err(TimerError::AlreadyRunning)
    );
    assert_eq!(s, paused);
}

#[test]
fn stop_records_real_focused_ms_excluding_pauses() {
    // Stop while paused: the open pause counts as paused, not focused.
    let mut s = classic_at(T0);
    s.pause(T0 + 4 * MIN).unwrap();
    s.resume(T0 + 6 * MIN).unwrap();
    s.pause(T0 + 9 * MIN).unwrap();
    let r = s.stop(T0 + 20 * MIN).unwrap();
    assert_eq!(r.focused_ms, 7 * MIN);
    assert_eq!(r.paused_total_ms, 13 * MIN);
    assert_eq!(r.ended_ms, T0 + 20 * MIN);
    assert_eq!(r.end_reason, EndReason::Stopped);
    assert!(s.is_idle());

    // Stop while running, with an earlier pause.
    let mut s = classic_at(T0);
    s.pause(T0 + 4 * MIN).unwrap();
    s.resume(T0 + 6 * MIN).unwrap();
    let r = s.stop(T0 + 16 * MIN + 500).unwrap();
    assert_eq!(r.focused_ms, 14 * MIN + 500);
    assert_eq!(r.paused_total_ms, 2 * MIN);
    assert_eq!(r.end_reason, EndReason::Stopped);
}

#[test]
fn advance_then_pause_past_planned_end_ends_instead() {
    // The caller's advance-then-act order: a command arriving after the planned end
    // first ends the session as completed, then finds nothing to act on.
    let late = T0 + 30 * MIN;
    let mut s = classic_at(T0);
    let r = ended(s.advance(late));
    assert_eq!(r.end_reason, EndReason::Completed);
    assert_eq!(r.ended_ms, T0 + 25 * MIN);
    assert_eq!(r.focused_ms, 25 * MIN);
    assert_eq!(s.pause(late), Err(TimerError::NothingRunning));
    assert_eq!(s.stop(late), Err(TimerError::NothingRunning));
    assert!(s.is_idle());
}

#[test]
fn session_snapshot_round_trips_json() {
    let mut s = classic_at(T0);
    let j = serde_json::to_value(&s).unwrap();
    assert_eq!(j["state"], "running");
    assert_eq!(j["preset"], "classic");
    assert_eq!(j["phase"], "focus");
    assert_eq!(j["id"], "a");
    assert_eq!(j["started_ms"], T0);
    assert_eq!(serde_json::from_value::<Session>(j).unwrap(), s);

    s.pause(T0 + MIN).unwrap();
    let text = serde_json::to_string(&s).unwrap();
    assert!(text.contains("\"state\":\"paused\""), "{text}");
    assert!(text.contains("\"pause_started_ms\""), "{text}");
    assert_eq!(serde_json::from_str::<Session>(&text).unwrap(), s);

    let idle = serde_json::to_string(&Session::Idle).unwrap();
    assert_eq!(idle, r#"{"state":"idle"}"#);
    assert_eq!(
        serde_json::from_str::<Session>(&idle).unwrap(),
        Session::Idle
    );
}
