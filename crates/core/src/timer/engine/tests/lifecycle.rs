use super::*;

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
