use super::*;

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
fn elapsed_clamped_on_backward_clock_never_negative() {
    let mut s = classic_at(T0);
    // Clock set back before the start.
    let v = s.view(T0 - 10 * MIN);
    assert_eq!(v.remaining_ms, 25 * MIN);
    assert_eq!(v.progress, 0.0);
    assert_eq!(s.view(0).remaining_ms, 25 * MIN);
    assert_eq!(s.advance(0, None), Vec::<Milestone>::new());
    // Remaining grows by the jump back.
    assert_eq!(s.view(T0 + 10 * MIN).remaining_ms, 15 * MIN);
    assert_eq!(s.view(T0 + 4 * MIN).remaining_ms, 21 * MIN);
    // Pause, then resume at an earlier instant: the pause adds nothing.
    s.pause(T0 + 10 * MIN).unwrap();
    s.resume(T0 + 2 * MIN).unwrap();
    assert_eq!(s.planned_end_ms(), Some(T0 + 25 * MIN));
    // Stop before the start: no focused time, and the record never ends before it starts.
    let r = s.stop(T0 - MIN).unwrap().remove(0);
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
    let _ = s.advance(u64::MAX, None);
    let mut s: Session = serde_json::from_value(serde_json::json!({
        "state": "paused", "id": "x", "preset": steady(), "phase": "focus", "break_kind": null,
        "started_ms": u64::MAX, "planned_ms": u64::MAX, "paused_total_ms": u64::MAX,
        "gap_ms": u64::MAX, "extensions": 255, "round": 255, "intent": null, "warned": false,
        "auto_step": false, "open_focus": null, "cut_breaks": [], "pause_started_ms": 0,
    }))
    .unwrap();
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
    let zero = SessionPreset::Library {
        id: PresetId("zero".into()),
        name: "Zero".into(),
        focus_min: 0,
        break_min: 5,
        long_break_min: 15,
        rounds: 4,
    };
    z.start(id("z"), zero, 1, T0).unwrap();
    let p = z.view(T0).progress;
    assert!((0.0..=1.0).contains(&p), "{p}");
}

#[test]
fn a_break_view_reports_the_extensions_already_taken() {
    let mut s = classic_at(T0);
    s.advance(T0 + 23 * MIN, None);
    s.extend(T0 + 23 * MIN).unwrap();
    assert_eq!(s.view(T0 + 23 * MIN).extensions, 1);
    s.advance(T0 + 35 * MIN, None);
    let v = s.view(T0 + 35 * MIN);
    assert_eq!(v.phase, Phase::Break);
    assert_eq!(v.extensions, 1);
}
