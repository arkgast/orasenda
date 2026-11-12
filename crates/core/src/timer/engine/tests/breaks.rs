use super::*;

#[test]
fn break_starts_at_planned_end() {
    let mut s = classic_at(T0);
    // Noticed 7 seconds late: the break still starts at the planned end.
    assert_eq!(s.advance(T0 + 25 * MIN + 7 * S, None), vec![Milestone::BreakStarted]);
    let v = s.view(T0 + 25 * MIN + 7 * S);
    assert_eq!(v.state, EngineState::Running);
    assert_eq!(v.phase, Phase::Break);
    assert_eq!(v.break_kind, Some(BreakKind::Short));
    assert_eq!(v.remaining_ms, 5 * MIN - 7 * S);
    assert_eq!(v.planned_end_ms, Some(T0 + 30 * MIN));
    assert!(v.open_focus);

    let rs = records(s.advance(T0 + 30 * MIN, None));
    assert!(s.is_idle());
    let (focus, brk) = (&rs[0], &rs[1]);
    assert_eq!((focus.phase, focus.end_reason), (Phase::Focus, EndReason::Completed));
    assert_eq!((focus.started_ms, focus.ended_ms), (T0, T0 + 25 * MIN));
    assert_eq!((focus.planned_ms, focus.focused_ms), (25 * MIN, 25 * MIN));
    assert_eq!(focus.break_kind, None);
    assert_span(focus, 0);
    assert_eq!((brk.phase, brk.end_reason), (Phase::Break, EndReason::Completed));
    assert_eq!(brk.break_kind, Some(BreakKind::Short));
    assert_eq!((brk.started_ms, brk.ended_ms), (T0 + 25 * MIN, T0 + 30 * MIN));
    assert_eq!(brk.planned_ms, 5 * MIN);
    assert_eq!(brk.preset, steady());
    assert_eq!(brk.intent, None);
    assert_ne!(brk.id, focus.id);
}

#[test]
fn long_break_at_round_n_each_default() {
    for (index, rounds, long_min, short_min) in [(0, 4, 15, 5), (1, 4, 15, 5), (2, 2, 30, 15)] {
        for round in 1..=2 * rounds {
            let mut s = at(index, round, T0);
            let focus_ms = library(index).focus_ms();
            s.advance(T0 + focus_ms, None);
            let v = s.view(T0 + focus_ms);
            let (kind, minutes) = if round % rounds == 0 {
                (BreakKind::Long, long_min)
            } else {
                (BreakKind::Short, short_min)
            };
            assert_eq!(v.break_kind, Some(kind), "preset {index} round {round}");
            assert_eq!(v.remaining_ms, minutes * MIN);
            let rs = records(s.advance(T0 + focus_ms + minutes * MIN, None));
            assert_eq!(rs[1].break_kind, Some(kind));
            assert_eq!(rs[1].planned_ms, minutes * MIN);
        }
    }
}

#[test]
fn warning_once_per_end() {
    let mut s = classic_at(T0);
    assert!(s.advance(T0 + 22 * MIN + 59 * S, None).is_empty());
    assert!(!s.view(T0).warned);
    assert_eq!(s.advance(T0 + 23 * MIN, None), vec![Milestone::Warned]);
    assert!(s.view(T0 + 23 * MIN).warned);
    for t in [23 * MIN + S, 24 * MIN, 24 * MIN + 59 * S] {
        assert!(s.advance(T0 + t, None).is_empty(), "again at {t}");
    }
    // The break (5 minutes) warns at 3:00 in, once.
    assert_eq!(s.advance(T0 + 25 * MIN, None), vec![Milestone::BreakStarted]);
    assert!(!s.view(T0 + 25 * MIN).warned);
    assert!(s.advance(T0 + 27 * MIN + 59 * S, None).is_empty());
    assert_eq!(s.advance(T0 + 28 * MIN, None), vec![Milestone::Warned]);
    assert!(s.advance(T0 + 29 * MIN, None).is_empty());
}

#[test]
fn no_warning_for_two_minutes_or_less() {
    // A 1-minute break and the 2-minute quick start never warn.
    let tiny = SessionPreset::Library {
        id: PresetId("tiny".into()),
        name: "Tiny".into(),
        focus_min: 5,
        break_min: 2,
        long_break_min: 5,
        rounds: 4,
    };
    let mut s = Session::Idle;
    s.start(id("t"), tiny, 1, T0).unwrap();
    assert_eq!(s.advance(T0 + 3 * MIN, None), vec![Milestone::Warned]);
    assert_eq!(s.advance(T0 + 5 * MIN, None), vec![Milestone::BreakStarted]);
    for t in (0..2 * 60).map(|k| T0 + 5 * MIN + k * S) {
        assert!(s.advance(t, None).is_empty(), "break of 2 minutes warned at {t}");
    }
    let _ = ended(s.advance(T0 + 7 * MIN, None));

    let mut q = Session::Idle;
    q.start(id("q"), SessionPreset::Quick, 1, T0).unwrap();
    for t in (0..120).map(|k| T0 + k * S) {
        assert!(q.advance(t, None).is_empty(), "quick warned at {t}");
    }
}

#[test]
fn quick_ends_without_a_break() {
    let mut q = Session::Idle;
    q.start(id("q"), SessionPreset::Quick, 1, T0).unwrap();
    let ms = q.advance(T0 + QUICK_START_MS + 9 * MIN, None);
    assert_eq!(ms.len(), 1);
    let rs = records(ms);
    assert_eq!(rs.len(), 1);
    assert_eq!((rs[0].end_reason, rs[0].ended_ms), (EndReason::Completed, T0 + QUICK_START_MS));
    assert_eq!(rs[0].break_kind, None);
    assert!(q.is_idle());
}

#[test]
fn stop_in_focus_is_one_stopped_record() {
    let mut s = classic_at(T0);
    let rs = s.stop(T0 + 10 * MIN).unwrap();
    assert_eq!(rs.len(), 1);
    assert_eq!(rs[0].end_reason, EndReason::Stopped);
    assert_span(&rs[0], 0);
    assert!(s.is_idle());
}

#[test]
fn stop_in_break_completes_focus() {
    let mut s = classic_at(T0);
    s.advance(T0 + 26 * MIN, None);
    let rs = s.stop(T0 + 27 * MIN).unwrap();
    assert_eq!(rs.len(), 2);
    let (focus, brk) = (&rs[0], &rs[1]);
    assert_eq!((focus.phase, focus.end_reason), (Phase::Focus, EndReason::Completed));
    assert_eq!(focus.ended_ms, T0 + 25 * MIN);
    assert_span(focus, 0);
    assert_eq!((brk.phase, brk.end_reason), (Phase::Break, EndReason::Stopped));
    assert_eq!((brk.started_ms, brk.ended_ms), (T0 + 25 * MIN, T0 + 27 * MIN));
    assert_eq!(brk.focused_ms, 2 * MIN);
    assert!(s.is_idle());
}

#[test]
fn pause_in_a_break_freezes_it_and_counts_in_the_break() {
    let mut s = classic_at(T0);
    s.advance(T0 + 25 * MIN, None);
    s.pause(T0 + 26 * MIN).unwrap();
    assert!(s.advance(T0 + 90 * MIN, None).is_empty());
    assert_eq!(s.view(T0 + 90 * MIN).remaining_ms, 4 * MIN);
    s.resume(T0 + 36 * MIN).unwrap();
    assert_eq!(s.planned_end_ms(), Some(T0 + 40 * MIN));
    let rs = records(s.advance(T0 + 40 * MIN, None));
    assert_eq!(rs[0].paused_total_ms, 0);
    assert_span(&rs[0], 0);
    assert_eq!(rs[1].paused_total_ms, 10 * MIN);
    assert_eq!(rs[1].focused_ms, 5 * MIN);
}

#[test]
fn snapshot_round_trips_in_a_break_with_an_open_focus() {
    let mut s = classic_at(T0);
    s.set_intent(Some("Outline".into()), T0).unwrap();
    s.advance(T0 + 25 * MIN, None);
    let text = serde_json::to_string(&s).unwrap();
    assert_eq!(serde_json::from_str::<Session>(&text).unwrap(), s);
    let j = serde_json::to_value(&s).unwrap();
    assert_eq!(j["phase"], "break");
    assert_eq!(j["break_kind"], "short");
}

#[test]
fn set_intent_in_focus_and_pause_only() {
    let mut s = classic_at(T0);
    assert_eq!(s.set_intent(Some("Draft".into()), T0 + MIN), Ok(()));
    assert_eq!(s.view(T0 + MIN).intent.as_deref(), Some("Draft"));
    s.pause(T0 + 2 * MIN).unwrap();
    assert_eq!(s.set_intent(Some("Edit".into()), T0 + 3 * MIN), Ok(()));
    assert_eq!(s.set_intent(None, T0 + 3 * MIN), Ok(()));
    assert_eq!(s.view(T0 + 3 * MIN).intent, None);
    s.set_intent(Some("Edit".into()), T0 + 3 * MIN).unwrap();
    s.resume(T0 + 4 * MIN).unwrap();
    s.advance(T0 + 26 * MIN, None);
    assert_eq!(s.set_intent(Some("x".into()), T0 + 26 * MIN), Err(TimerError::WrongState));
    let rs = s.stop(T0 + 27 * MIN).unwrap();
    assert_eq!(rs[0].intent.as_deref(), Some("Edit"));
    assert_eq!(rs[1].intent, None);
    assert_eq!(Session::Idle.set_intent(None, T0), Err(TimerError::NothingRunning));
}
