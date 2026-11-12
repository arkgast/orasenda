//! `TimerView.mode` and the fields the cadence adds to the view.

use orasenda_core::timer::suggestions::{BreakFor, pick};
use orasenda_core::{BreakKind, EngineState, Phase, format_clock};

use super::super::test_support::*;
use super::super::*;
use crate::api::{MilestoneKind, Mode, Offer, TimerCommandErrorKind};

#[test]
fn view_mode_each_phase() {
    let mut s = service();
    numbered_break_ids(&mut s);
    assert_eq!(s.view(T0).mode, Mode::Idle);
    s.apply(start(), T0, id("a"));
    assert_eq!(s.view(T0 + MINUTE).mode, Mode::Focus);

    // Two minutes left: the tick warns once, and only then is the mode `warning`.
    let warned = s.tick(T0 + 23 * MINUTE);
    assert_eq!(kinds(&warned.milestones), [MilestoneKind::Warned]);
    assert_eq!(warned.milestones[0].phase, Phase::Focus);
    assert!(warned.warned);
    assert_eq!(warned.view.mode, Mode::Warning);
    assert!(s.tick(T0 + 23 * MINUTE + 1).milestones.is_empty());

    let paused = s.apply(Action::Pause, T0 + 24 * MINUTE, id("x"));
    assert_eq!(paused.view.mode, Mode::Paused);
    s.apply(Action::Resume, T0 + 24 * MINUTE, id("x"));

    // The focus ends by itself and the break begins at the planned end.
    let on_break = s.tick(T0 + 25 * MINUTE + MINUTE);
    assert_eq!(kinds(&on_break.milestones), [MilestoneKind::BreakStarted]);
    assert!(on_break.break_started);
    assert_eq!(on_break.milestones[0].phase, Phase::Break);
    let view = on_break.view;
    assert_eq!((view.mode, view.phase), (Mode::Break, Phase::Break));
    assert_eq!(view.break_kind, Some(BreakKind::Short));
    assert_eq!(
        view.session_id,
        Some(orasenda_core::SessionId("brk-1".into()))
    );
    assert_eq!(view.state, EngineState::Running);

    // A break of five minutes warns in its last two, once.
    let last = s.tick(T0 + 25 * MINUTE + 3 * MINUTE);
    assert_eq!(kinds(&last.milestones), [MilestoneKind::Warned]);
    assert_eq!(last.milestones[0].phase, Phase::Break);
    assert_eq!(last.view.mode, Mode::Warning);
    let paused = s.apply(Action::Pause, T0 + 29 * MINUTE, id("x"));
    assert_eq!(paused.view.mode, Mode::Paused);
}

#[test]
fn quick_has_no_warning() {
    let mut s = service();
    s.apply(start_quick(), T0, id("q"));
    let late = s.tick(T0 + 90_000);
    assert!(late.milestones.is_empty());
    assert_eq!(late.view.mode, Mode::Focus);
    assert!(late.view.quick);
}

#[test]
fn can_extend_caps_zero_to_three() {
    for cap in 0..=3u8 {
        let mut s = service();
        numbered_break_ids(&mut s);
        change_settings(&mut s, |v| v.extension_cap = cap);
        s.apply(start(), T0, id("a"));
        assert!(
            !s.view(T0 + MINUTE).can_extend,
            "not offered with 24 minutes left"
        );
        let mut end = T0 + CLASSIC_MS;
        let mut taken = 0;
        loop {
            let view = s.tick(end - MINUTE).view;
            assert_eq!(view.extensions, taken);
            if !view.can_extend {
                break;
            }
            let extended = s.apply(Action::Extend, end - MINUTE, id("x"));
            assert_eq!(kinds(&extended.milestones), [MilestoneKind::Extended]);
            assert_eq!(extended.view.mode, Mode::Focus);
            taken += 1;
            end += 10 * MINUTE;
        }
        assert_eq!(taken, cap, "cap {cap}");
        let refused = s.apply(Action::Extend, end - MINUTE, id("x"));
        assert_eq!(kind(&refused), Some(TimerCommandErrorKind::ExtensionCap));
    }
}

#[test]
fn can_extend_is_hidden_when_it_would_not_work() {
    let mut s = service();
    s.apply(start(), T0, id("a"));
    let early = s.apply(Action::Extend, T0 + MINUTE, id("x"));
    assert_eq!(kind(&early), Some(TimerCommandErrorKind::WrongState));
    s.tick(T0 + 24 * MINUTE);
    s.apply(Action::Pause, T0 + 24 * MINUTE, id("x"));
    assert!(!s.view(T0 + 24 * MINUTE).can_extend, "hidden while paused");
    let paused = s.apply(Action::Extend, T0 + 24 * MINUTE, id("x"));
    assert_eq!(kind(&paused), Some(TimerCommandErrorKind::WrongState));
    s.apply(Action::Resume, T0 + 24 * MINUTE, id("x"));
    assert!(s.view(T0 + 24 * MINUTE).can_extend);
    s.apply(Action::Stop, T0 + 24 * MINUTE, id("x"));

    let mut q = service();
    q.apply(start_quick(), T0, id("q"));
    assert!(!q.view(T0 + 90_000).can_extend);
    let quick = q.apply(Action::Extend, T0 + 90_000, id("x"));
    assert_eq!(kind(&quick), Some(TimerCommandErrorKind::WrongState));
    let idle = service().apply(Action::Extend, T0, id("x"));
    assert_eq!(kind(&idle), Some(TimerCommandErrorKind::WrongState));
}

#[test]
fn auto_continue_hides_extend_and_offer() {
    let mut s = service();
    numbered_break_ids(&mut s);
    change_settings(&mut s, |v| {
        v.auto_continue = true;
        v.longest_focus_min = 60;
    });
    s.apply(start(), T0, id("a"));
    let warning = s.tick(T0 + 24 * MINUTE);
    assert!(
        !warning.view.can_extend,
        "no +10 in focus while auto-continue is on"
    );
    assert_eq!(warning.view.check_in, None);
    let refused = s.apply(Action::Extend, T0 + 24 * MINUTE, id("x"));
    assert_eq!(kind(&refused), Some(TimerCommandErrorKind::WrongState));

    // At the end the focus takes a step: still going, with the finish in the check-in.
    let step = s.tick(T0 + 25 * MINUTE);
    assert_eq!(kinds(&step.milestones), [MilestoneKind::Extended]);
    let finish = format_clock(T0 + 35 * MINUTE, OFFSET_MIN, CYCLE);
    assert_eq!(
        step.view.check_in,
        Some(format!("Still going · ends {finish}"))
    );
    let paused = s.apply(Action::Pause, T0 + 26 * MINUTE, id("x"));
    assert_eq!(paused.view.check_in, None, "hidden while paused");

    // Take a break from the first step: "+10 min" is offered there, under the cap.
    s.apply(Action::Resume, T0 + 26 * MINUTE, id("x"));
    let on_break = s.apply(Action::TakeBreak, T0 + 27 * MINUTE, id("x"));
    assert_eq!(on_break.view.mode, Mode::Break);
    assert!(on_break.view.can_extend, "+10 stays on offer from a break");
    assert_eq!(on_break.view.check_in, None);
    assert_eq!(on_break.view.offer, None::<Offer>);
}

#[test]
fn suggestion_rotates_per_day_kind() {
    let mut s = service();
    numbered_break_ids(&mut s);
    let mut at = T0;
    let mut shown = Vec::new();
    for round in 1..=4 {
        let started = s.apply(start(), at, id(&format!("f{round}")));
        assert_eq!(started.view.suggestion, None, "none in a focus");
        let in_break = s.tick(at + CLASSIC_MS);
        let suggestion = in_break.view.suggestion.expect("a break shows one line");
        let expected = match in_break.view.break_kind {
            Some(BreakKind::Long) => pick(BreakFor::Long, 0),
            _ => pick(BreakFor::Short, shown.len()),
        };
        assert_eq!(suggestion.text, expected.text, "round {round}");
        assert_eq!(suggestion.label, expected.label);
        shown.push(suggestion.text);
        at += CLASSIC_MS + in_break.view.remaining_ms;
        s.tick(at);
    }
    assert_eq!(s.view(at).suggestion, None, "none once idle");
}
