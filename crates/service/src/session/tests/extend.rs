//! `+10 min` and take a break.

use orasenda_core::{BreakKind, EndReason, Phase};

use super::super::test_support::*;
use super::super::*;
use crate::api::{MilestoneKind, Mode, TimerCommandErrorKind};

#[test]
fn extend_from_the_warning_and_from_a_break() {
    let mut s = service();
    numbered_break_ids(&mut s);
    s.apply(start(), T0, id("a"));
    s.tick(T0 + 23 * MINUTE);
    let extended = s.apply(Action::Extend, T0 + 24 * MINUTE, id("x"));
    assert_eq!(kinds(&extended.milestones), [MilestoneKind::Extended]);
    assert_eq!(extended.milestones[0].phase, Phase::Focus);
    assert_eq!(extended.view.extensions, 1);
    assert_eq!(extended.view.mode, Mode::Focus, "the warning clears");
    assert_eq!(extended.view.remaining_ms, 11 * MINUTE);

    // The new end warns again, and the break that follows takes the focus back with +10.
    let warned = s.tick(T0 + 33 * MINUTE);
    assert_eq!(kinds(&warned.milestones), [MilestoneKind::Warned]);
    let on_break = s.tick(T0 + 35 * MINUTE);
    assert_eq!(
        on_break.view.extensions, 1,
        "the focus's extensions show in its break"
    );
    let back = s.apply(Action::Extend, T0 + 36 * MINUTE, id("x"));
    assert_eq!(kinds(&back.milestones), [MilestoneKind::Extended]);
    assert_eq!(back.view.phase, Phase::Focus);
    assert_eq!(back.view.extensions, 2);
    assert_eq!(
        back.view.session_id,
        Some(orasenda_core::SessionId("a".into()))
    );
    // At the cap (2) there is no third.
    assert!(!back.view.can_extend);
    let end = s.apply(Action::Stop, T0 + 40 * MINUTE, id("x"));
    assert_eq!(end.view.mode, Mode::Idle);
}

#[test]
fn take_break_completes_the_focus_and_starts_the_break() {
    let mut s = service();
    numbered_break_ids(&mut s);
    s.apply(start(), T0, id("a"));
    let taken = s.apply(Action::TakeBreak, T0 + 10 * MINUTE, id("x"));
    assert_eq!(kinds(&taken.milestones), [MilestoneKind::BreakStarted]);
    assert!(taken.break_started);
    assert_eq!(taken.view.mode, Mode::Break);
    assert_eq!(taken.view.break_kind, Some(BreakKind::Short));
    assert_eq!(taken.view.remaining_ms, 5 * MINUTE);
    let again = s.apply(Action::TakeBreak, T0 + 11 * MINUTE, id("x"));
    assert_eq!(kind(&again), Some(TimerCommandErrorKind::WrongState));
    let idle = service().apply(Action::TakeBreak, T0, id("x"));
    assert_eq!(kind(&idle), Some(TimerCommandErrorKind::WrongState));
    let mut q = service();
    q.apply(start_quick(), T0, id("q"));
    assert_eq!(
        kind(&q.apply(Action::TakeBreak, T0 + 1, id("x"))),
        Some(TimerCommandErrorKind::WrongState)
    );

    // Skipping the break writes the focus as completed and the break as stopped.
    let skipped = s.apply(Action::Stop, T0 + 12 * MINUTE, id("x"));
    assert_eq!(skipped.milestones[0].kind, MilestoneKind::Ended);
    assert_eq!(skipped.milestones[0].phase, Phase::Break);
    assert_eq!(skipped.milestones[0].end_reason, Some(EndReason::Stopped));
    assert!(
        skipped
            .ended
            .is_some_and(|r| r.end_reason == EndReason::Stopped)
    );
}
