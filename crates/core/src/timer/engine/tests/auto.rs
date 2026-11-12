use super::*;

const LIMIT: Option<u64> = Some(60 * MIN);

#[test]
fn auto_steps_to_limit_then_break() {
    let mut s = classic_at(T0);
    // 25 -> 35 -> 45 -> 55; a fourth step would pass 60, so the focus completes at 55.
    assert_eq!(s.advance(T0 + 25 * MIN, LIMIT), vec![Milestone::Extended]);
    let v = s.view(T0 + 25 * MIN);
    assert_eq!((v.extensions, v.auto_step, v.warned), (1, true, false));
    assert_eq!(v.planned_end_ms, Some(T0 + 35 * MIN));
    assert_eq!(s.advance(T0 + 35 * MIN, LIMIT), vec![Milestone::Extended]);
    assert_eq!(s.advance(T0 + 45 * MIN, LIMIT), vec![Milestone::Extended]);
    assert_eq!(s.advance(T0 + 55 * MIN, LIMIT), vec![Milestone::BreakStarted]);
    let rs = records(s.advance(T0 + 60 * MIN, LIMIT));
    assert_eq!((rs[0].planned_ms, rs[0].extensions), (55 * MIN, 3));
    assert_eq!((rs[0].end_reason, rs[0].focused_ms), (EndReason::Completed, 55 * MIN));
    assert_span(&rs[0], 0);
}

#[test]
fn auto_steps_warn_before_each_end() {
    let mut s = classic_at(T0);
    assert_eq!(s.advance(T0 + 23 * MIN, LIMIT), vec![Milestone::Warned]);
    assert_eq!(s.advance(T0 + 25 * MIN, LIMIT), vec![Milestone::Extended]);
    assert!(s.advance(T0 + 32 * MIN, LIMIT).is_empty());
    assert_eq!(s.advance(T0 + 33 * MIN, LIMIT), vec![Milestone::Warned]);
}

#[test]
fn auto_none_when_focus_at_limit() {
    // Deep Work is 90 minutes: with the default limit of 90 nothing is added.
    let mut s = at(2, 1, T0);
    assert_eq!(s.advance(T0 + 90 * MIN, Some(90 * MIN)), vec![Milestone::BreakStarted]);
    // Off: the same, for any preset.
    let mut s = classic_at(T0);
    assert_eq!(s.advance(T0 + 25 * MIN, None), vec![Milestone::BreakStarted]);
}

#[test]
fn take_break_completes_the_focus_and_starts_the_break() {
    let mut s = classic_at(T0);
    s.advance(T0 + 25 * MIN, LIMIT);
    assert_eq!(s.take_break(T0 + 30 * MIN), Ok(Milestone::BreakStarted));
    let v = s.view(T0 + 30 * MIN);
    assert_eq!((v.phase, v.break_kind, v.open_focus), (Phase::Break, Some(BreakKind::Short), true));
    assert_eq!(v.remaining_ms, 5 * MIN);
    assert_eq!(v.planned_end_ms, Some(T0 + 35 * MIN));
    let rs = records(s.advance(T0 + 35 * MIN, LIMIT));
    assert_eq!((rs[0].end_reason, rs[0].ended_ms, rs[0].focused_ms), (EndReason::Completed, T0 + 30 * MIN, 30 * MIN));
    assert_eq!(rs[0].extensions, 1);
    assert_span(&rs[0], 0);
    assert_eq!((rs[1].started_ms, rs[1].ended_ms), (T0 + 30 * MIN, T0 + 35 * MIN));
}

#[test]
fn take_break_while_paused_counts_the_pause() {
    let mut s = classic_at(T0);
    s.pause(T0 + 8 * MIN).unwrap();
    assert_eq!(s.take_break(T0 + 12 * MIN), Ok(Milestone::BreakStarted));
    let rs = s.stop(T0 + 13 * MIN).unwrap();
    assert_eq!((rs[0].focused_ms, rs[0].paused_total_ms, rs[0].ended_ms), (8 * MIN, 4 * MIN, T0 + 12 * MIN));
    assert_span(&rs[0], 0);
    assert_eq!(rs[1].end_reason, EndReason::Stopped);
}

#[test]
fn take_break_is_refused_in_a_break_idle_or_quick() {
    let mut s = classic_at(T0);
    s.advance(T0 + 25 * MIN, None);
    assert_eq!(s.take_break(T0 + 26 * MIN), Err(TimerError::WrongState));
    assert_eq!(Session::Idle.take_break(T0), Err(TimerError::NothingRunning));
    let mut q = Session::Idle;
    q.start(id("q"), SessionPreset::Quick, 1, T0).unwrap();
    assert_eq!(q.take_break(T0 + S), Err(TimerError::WrongState));
}

#[test]
fn take_break_on_round_n_is_a_long_break() {
    let mut s = at(1, 4, T0);
    s.take_break(T0 + 10 * MIN).unwrap();
    assert_eq!(s.view(T0 + 10 * MIN).break_kind, Some(BreakKind::Long));
}

#[test]
fn end_in_a_step_is_stopped() {
    let mut s = classic_at(T0);
    s.advance(T0 + 25 * MIN, LIMIT);
    let rs = s.stop(T0 + 30 * MIN).unwrap();
    assert_eq!(rs.len(), 1);
    assert_eq!((rs[0].end_reason, rs[0].extensions), (EndReason::Stopped, 1));
}

#[test]
fn no_step_at_a_paused_end() {
    let mut s = classic_at(T0);
    s.pause(T0 + 20 * MIN).unwrap();
    assert!(s.advance(T0 + 300 * MIN, LIMIT).is_empty());
    assert_eq!(s.view(T0).extensions, 0);
    s.resume(T0 + 30 * MIN).unwrap();
    // The end moved with the pause: 25 + 10 minutes after the start.
    assert_eq!(s.planned_end_ms(), Some(T0 + 35 * MIN));
    assert_eq!(s.advance(T0 + 35 * MIN, LIMIT), vec![Milestone::Extended]);
}

#[test]
fn sleep_across_several_steps_stops_at_the_limit() {
    let mut s = classic_at(T0);
    let ms = s.advance(T0 + 3 * 60 * MIN, LIMIT);
    let names: Vec<&str> = ms
        .iter()
        .map(|m| match m {
            Milestone::Extended => "extended",
            Milestone::BreakStarted => "break",
            Milestone::Ended(_) => "ended",
            Milestone::Warned => "warned",
            _ => "other",
        })
        .collect();
    assert_eq!(names, ["extended", "extended", "extended", "break", "ended"]);
    let rs = records(ms);
    assert_eq!((rs[0].ended_ms, rs[0].extensions), (T0 + 55 * MIN, 3));
    assert_eq!((rs[1].started_ms, rs[1].ended_ms), (T0 + 55 * MIN, T0 + 60 * MIN));
    assert!(s.is_idle());
}

#[test]
fn quick_rolls_on_with_auto_and_not_without() {
    let mut q = Session::Idle;
    q.start(id("q"), SessionPreset::Quick, 1, T0).unwrap();
    let ms = q.advance(T0 + QUICK_START_MS, LIMIT);
    assert_eq!(ms.len(), 2);
    assert!(matches!(ms[0], Milestone::Ended(_)));
    assert_eq!(ms[1], Milestone::RollOn);
    assert!(q.is_idle());

    let mut q = Session::Idle;
    q.start(id("q"), SessionPreset::Quick, 1, T0).unwrap();
    let ms = q.advance(T0 + QUICK_START_MS, None);
    assert_eq!(ms.len(), 1);
}
