use super::*;

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
