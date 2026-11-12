use super::*;

#[test]
fn sleep_across_focus_and_break_two_records() {
    let mut s = classic_at(T0);
    // Closed at 10:00, reopened ten hours later: both ends passed, no warning.
    let ms = s.advance(T0 + 10 * 60 * MIN, None);
    assert_eq!(ms.len(), 2);
    assert_eq!(ms[0], Milestone::BreakStarted);
    let rs = records(ms);
    assert_eq!(rs.len(), 2);
    assert_eq!((rs[0].started_ms, rs[0].ended_ms), (T0, T0 + 25 * MIN));
    assert_eq!(
        (rs[0].end_reason, rs[0].focused_ms),
        (EndReason::Completed, 25 * MIN)
    );
    assert_span(&rs[0], 0);
    assert_eq!(
        (rs[1].started_ms, rs[1].ended_ms),
        (T0 + 25 * MIN, T0 + 30 * MIN)
    );
    assert_eq!(rs[1].end_reason, EndReason::Completed);
    assert!(s.is_idle());
}

#[test]
fn sleep_past_a_focus_end_warns_only_for_the_live_break() {
    let mut s = classic_at(T0);
    // 28:00 is inside the break's last two minutes, but its warning is for the live end only
    // when it has not been crossed; here the break is current, so it warns once.
    let ms = s.advance(T0 + 28 * MIN + 30 * S, None);
    assert_eq!(ms, vec![Milestone::BreakStarted, Milestone::Warned]);
    // Crossing the warning of the focus (23:00) while the focus end also passed: no Warned.
    let mut s = classic_at(T0);
    let ms = s.advance(T0 + 26 * MIN, None);
    assert_eq!(ms, vec![Milestone::BreakStarted]);
}

#[test]
fn sleep_across_a_long_break() {
    let mut s = at(2, 2, T0);
    let ms = s.advance(T0 + 24 * 60 * MIN, None);
    let rs = records(ms);
    assert_eq!(rs[1].break_kind, Some(BreakKind::Long));
    assert_eq!(
        (rs[1].started_ms, rs[1].ended_ms),
        (T0 + 90 * MIN, T0 + 120 * MIN)
    );
}

#[test]
fn a_clock_set_back_after_the_ends_changes_nothing() {
    let mut s = classic_at(T0);
    let _ = records(s.advance(T0 + 60 * MIN, None));
    assert!(s.advance(T0, None).is_empty());
    assert!(s.is_idle());
    // And inside a break: no new warning, no end, no panic.
    let mut s = classic_at(T0);
    s.advance(T0 + 26 * MIN, None);
    assert!(s.advance(T0 - 5 * MIN, None).is_empty());
    assert_eq!(s.view(T0 - 5 * MIN).remaining_ms, 5 * MIN);
    assert!(s.stop(T0 - 5 * MIN).unwrap().len() == 2);
}
