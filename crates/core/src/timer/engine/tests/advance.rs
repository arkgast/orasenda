use super::*;

#[test]
fn late_advance_ends_at_planned_end_not_now() {
    let mut s = classic_at(T0);
    s.pause(T0 + MIN).unwrap();
    s.resume(T0 + 3 * MIN).unwrap();
    let planned_end = T0 + 27 * MIN;
    // Two minutes before the end the warning comes, once.
    assert_eq!(s.advance(planned_end - 1, None), vec![Milestone::Warned]);
    let r = ended(s.advance(planned_end + 7 * 60 * MIN, None));
    assert_eq!(r.ended_ms, planned_end);
    assert_eq!(r.focused_ms, 25 * MIN);
    assert_eq!(r.planned_ms, 25 * MIN);
    assert_eq!(r.paused_total_ms, 2 * MIN);
    assert_eq!(r.end_reason, EndReason::Completed);
    assert_eq!(r.extensions, 0);
    assert!(s.is_idle());

    // Exactly at the planned end also ends.
    let mut s = classic_at(T0);
    let first = s.advance(T0 + 25 * MIN, None);
    assert!(matches!(first.as_slice(), [Milestone::BreakStarted]));
    assert_eq!(ended(s.advance(T0 + 30 * MIN, None)).ended_ms, T0 + 25 * MIN);
}

#[test]
fn advance_on_paused_never_ends() {
    let mut s = classic_at(T0);
    s.pause(T0 + MIN).unwrap();
    let before = s.clone();
    for later in [T0 + 25 * MIN, T0 + 365 * 24 * 60 * MIN, u64::MAX] {
        assert_eq!(s.advance(later, None), Vec::<Milestone>::new());
    }
    assert_eq!(s, before);
}

#[test]
fn advance_on_idle_is_none() {
    let mut s = Session::Idle;
    assert_eq!(s.advance(T0, None), Vec::<Milestone>::new());
    assert_eq!(s.advance(u64::MAX, None), Vec::<Milestone>::new());
    assert!(s.is_idle());
}

#[test]
fn advance_after_end_with_earlier_now_stays_idle() {
    let mut s = classic_at(T0);
    let record = ended(s.advance(T0 + 30 * MIN, None));
    assert_eq!(record.end_reason, EndReason::Completed);
    assert_eq!(record.ended_ms, T0 + 25 * MIN);
    for earlier in [T0 + MIN, T0, 0] {
        assert_eq!(s.advance(earlier, None), Vec::<Milestone>::new(), "at {earlier}");
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
    for (preset, planned) in [
        (SessionPreset::Quick, QUICK_START_MS),
        (steady(), 25 * MIN),
        (library(2), 90 * MIN),
    ] {
        let mut s = Session::Idle;
        s.start(id("p"), preset.clone(), 1, T0).unwrap();
        let r = ended(s.advance(T0 + planned + 60 * MIN, None));
        assert_eq!(r.preset, preset);
        assert_eq!(r.planned_ms, planned);
        assert_eq!(r.focused_ms, planned);
    }
    let mut s = Session::Idle;
    s.start(id("q"), SessionPreset::Quick, 1, T0).unwrap();
    assert_eq!(s.view(T0).remaining_ms, QUICK_START_MS);
    assert_eq!(s.stop(T0 + MIN).unwrap().preset, SessionPreset::Quick);
}

#[test]
fn one_milestone_per_transition_none_per_tick() {
    let mut s = Session::Idle;
    assert_eq!(s.start(id("a"), steady(), 1, T0), Ok(()));
    for t in (0..10 * 60).map(|k| T0 + k * S) {
        assert_eq!(s.advance(t, None), Vec::<Milestone>::new(), "tick at {t}");
    }
    assert_eq!(s.pause(T0 + 10 * MIN), Ok(()));
    for t in (0..120).map(|k| T0 + 10 * MIN + k * S) {
        assert_eq!(s.advance(t, None), Vec::<Milestone>::new());
    }
    assert_eq!(s.resume(T0 + 12 * MIN), Ok(()));
    // The pause moved the end to 27:00; the warning comes at 25:00, the break at 27:00 and
    // the break's end at 32:00. One milestone each, none on any other tick.
    let mut seen = Vec::new();
    for t in (0..60 * 60).map(|k| T0 + 12 * MIN + k * S) {
        for m in s.advance(t, None) {
            seen.push((t, m));
        }
    }
    assert_eq!(seen.len(), 3, "{seen:?}");
    assert_eq!(seen[0], (T0 + 25 * MIN, Milestone::Warned));
    assert_eq!(seen[1], (T0 + 27 * MIN, Milestone::BreakStarted));
    assert_eq!(seen[2].0, T0 + 32 * MIN);
    assert!(matches!(seen[2].1, Milestone::Ended(_)));
}

#[test]
fn advance_then_pause_past_planned_end_ends_instead() {
    // The caller's advance-then-act order: a command arriving after the planned end
    // first ends the session as completed, then finds nothing to act on.
    let late = T0 + 30 * MIN;
    let mut s = classic_at(T0);
    let r = ended(s.advance(late, None));
    assert_eq!(r.end_reason, EndReason::Completed);
    assert_eq!(r.ended_ms, T0 + 25 * MIN);
    assert_eq!(r.focused_ms, 25 * MIN);
    assert_eq!(s.pause(late), Err(TimerError::NothingRunning));
    assert_eq!(s.stop(late), Err(TimerError::NothingRunning));
    assert!(s.is_idle());
}
