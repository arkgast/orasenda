use super::*;

#[test]
fn extend_from_the_warning() {
    let mut s = classic_at(T0);
    assert_eq!(s.advance(T0 + 23 * MIN, None), vec![Milestone::Warned]);
    assert_eq!(s.extend(T0 + 23 * MIN), Ok(Milestone::Extended));
    let v = s.view(T0 + 23 * MIN);
    assert_eq!((v.extensions, v.warned, v.phase), (1, false, Phase::Focus));
    assert_eq!(v.remaining_ms, 12 * MIN);
    assert_eq!(v.planned_end_ms, Some(T0 + 35 * MIN));
    // A new warning comes two minutes before the new end, once.
    assert!(s.advance(T0 + 32 * MIN + 59 * S, None).is_empty());
    assert_eq!(s.advance(T0 + 33 * MIN, None), vec![Milestone::Warned]);
    assert_eq!(
        s.advance(T0 + 35 * MIN, None),
        vec![Milestone::BreakStarted]
    );
    let rs = records(s.advance(T0 + 40 * MIN, None));
    assert_eq!((rs[0].planned_ms, rs[0].extensions), (35 * MIN, 1));
    assert_eq!(rs[0].end_reason, EndReason::Completed);
    assert_span(&rs[0], 0);
}

#[test]
fn extend_is_refused_outside_the_last_two_minutes() {
    let mut s = classic_at(T0);
    assert_eq!(s.extend(T0 + MIN), Err(TimerError::WrongState));
    assert_eq!(
        s.extend(T0 + 22 * MIN + 59 * S),
        Err(TimerError::WrongState)
    );
    assert_eq!(s.view(T0).extensions, 0);
    // Hidden while paused.
    s.pause(T0 + 24 * MIN).unwrap();
    assert_eq!(s.extend(T0 + 24 * MIN), Err(TimerError::WrongState));
    s.resume(T0 + 25 * MIN).unwrap();
    assert_eq!(s.extend(T0 + 25 * MIN), Ok(Milestone::Extended));
    assert_eq!(Session::Idle.extend(T0), Err(TimerError::NothingRunning));
    let mut q = Session::Idle;
    q.start(id("q"), SessionPreset::Quick, 1, T0).unwrap();
    assert_eq!(q.extend(T0 + 100 * S), Err(TimerError::WrongState));
}

#[test]
fn extend_from_break_records_stopped_break() {
    let mut s = classic_at(T0);
    s.set_intent(Some("Outline".into()), T0).unwrap();
    s.advance(T0 + 25 * MIN, None);
    assert_eq!(s.extend(T0 + 27 * MIN), Ok(Milestone::Extended));
    let v = s.view(T0 + 27 * MIN);
    assert_eq!(
        (v.phase, v.state, v.break_kind),
        (Phase::Focus, EngineState::Running, None)
    );
    assert_eq!((v.extensions, v.open_focus), (1, false));
    assert_eq!(v.intent.as_deref(), Some("Outline"));
    assert_eq!(v.session_id, Some(id("a")));
    assert_eq!(v.remaining_ms, 10 * MIN);
    assert_eq!(v.planned_end_ms, Some(T0 + 37 * MIN));

    // Stop at 30:00: focus = 25 + 3 minutes, the gap (the break's 2 minutes) excluded.
    let rs = s.stop(T0 + 30 * MIN).unwrap();
    assert_eq!(rs.len(), 2);
    let (focus, brk) = (&rs[0], &rs[1]);
    assert_eq!(
        (focus.end_reason, focus.extensions),
        (EndReason::Stopped, 1)
    );
    assert_eq!(focus.focused_ms, 28 * MIN);
    assert_eq!(focus.intent.as_deref(), Some("Outline"));
    assert_span(focus, 2 * MIN);
    assert_eq!(
        (brk.phase, brk.end_reason),
        (Phase::Break, EndReason::Stopped)
    );
    assert_eq!(
        (brk.started_ms, brk.ended_ms, brk.focused_ms),
        (T0 + 25 * MIN, T0 + 27 * MIN, 2 * MIN)
    );
}

#[test]
fn extend_from_break_then_complete_gives_three_rows() {
    let mut s = classic_at(T0);
    s.advance(T0 + 25 * MIN, None);
    s.extend(T0 + 27 * MIN).unwrap();
    assert_eq!(
        s.advance(T0 + 37 * MIN, None),
        vec![Milestone::BreakStarted]
    );
    let rs = records(s.advance(T0 + 42 * MIN, None));
    assert_eq!(rs.len(), 3);
    let (focus, cut, last) = (&rs[0], &rs[1], &rs[2]);
    assert_eq!(
        (focus.end_reason, focus.extensions, focus.planned_ms),
        (EndReason::Completed, 1, 35 * MIN)
    );
    assert_eq!(focus.ended_ms, T0 + 37 * MIN);
    assert_eq!(focus.focused_ms, 35 * MIN);
    assert_span(focus, 2 * MIN);
    assert_eq!(cut.end_reason, EndReason::Stopped);
    assert_eq!(
        (last.end_reason, last.started_ms, last.ended_ms),
        (EndReason::Completed, T0 + 37 * MIN, T0 + 42 * MIN)
    );
    let ids = [&focus.id, &cut.id, &last.id];
    assert!(ids[0] != ids[1] && ids[1] != ids[2] && ids[0] != ids[2]);
}

#[test]
fn extend_in_a_paused_break_is_refused() {
    let mut s = classic_at(T0);
    s.advance(T0 + 25 * MIN, None);
    s.pause(T0 + 26 * MIN).unwrap();
    assert_eq!(s.extend(T0 + 27 * MIN), Err(TimerError::WrongState));
}

#[test]
fn extend_from_a_long_break_resumes_focus_with_the_same_round() {
    let mut s = at(0, 4, T0);
    s.advance(T0 + 15 * MIN, None);
    assert_eq!(s.view(T0 + 15 * MIN).break_kind, Some(BreakKind::Long));
    s.extend(T0 + 16 * MIN).unwrap();
    // The next break is long again: it is still round 4.
    s.advance(T0 + 26 * MIN, None);
    assert_eq!(s.view(T0 + 26 * MIN).break_kind, Some(BreakKind::Long));
}
