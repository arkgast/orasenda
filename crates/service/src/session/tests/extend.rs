//! `+10 min`, take a break and the intent.

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
    assert_eq!(on_break.view.extensions, 1, "the focus's extensions show in its break");
    let back = s.apply(Action::Extend, T0 + 36 * MINUTE, id("x"));
    assert_eq!(kinds(&back.milestones), [MilestoneKind::Extended]);
    assert_eq!(back.view.phase, Phase::Focus);
    assert_eq!(back.view.extensions, 2);
    assert_eq!(back.view.session_id, Some(orasenda_core::SessionId("a".into())));
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
    assert_eq!(kind(&q.apply(Action::TakeBreak, T0 + 1, id("x"))), Some(TimerCommandErrorKind::WrongState));

    // Skipping the break writes the focus as completed and the break as stopped.
    let skipped = s.apply(Action::Stop, T0 + 12 * MINUTE, id("x"));
    assert_eq!(skipped.milestones[0].kind, MilestoneKind::Ended);
    assert_eq!(skipped.milestones[0].phase, Phase::Break);
    assert_eq!(skipped.milestones[0].end_reason, Some(EndReason::Stopped));
    assert!(skipped.ended.is_some_and(|r| r.end_reason == EndReason::Stopped));
}

fn intent_of(s: &mut SessionService, intent: Option<&str>) -> Result<Option<String>, TimerCommandErrorKind> {
    let effects = s.apply(Action::SetIntent(intent.map(str::to_owned)), T0 + MINUTE, id("x"));
    match kind(&effects) {
        Some(error) => Err(error),
        None => Ok(effects.view.intent),
    }
}

#[test]
fn set_intent_trims_and_limits() {
    let mut s = service();
    assert_eq!(intent_of(&mut s, Some("x")), Err(TimerCommandErrorKind::WrongState), "idle");
    s.apply(start(), T0, id("a"));
    assert_eq!(
        intent_of(&mut s, Some("  Write \t the\n chapter  ")),
        Ok(Some("Write the chapter".into()))
    );
    let max = "é".repeat(120);
    assert_eq!(intent_of(&mut s, Some(&max)), Ok(Some(max.clone())));
    let over = "é".repeat(121);
    assert_eq!(intent_of(&mut s, Some(&over)), Err(TimerCommandErrorKind::InvalidIntent));
    assert_eq!(s.view(T0 + MINUTE).intent, Some(max), "a refused intent changes nothing");
    assert_eq!(intent_of(&mut s, Some("   ")), Ok(None));
    assert_eq!(intent_of(&mut s, None), Ok(None));
    intent_of(&mut s, Some("Outline chapter 3")).expect("sets");

    // It survives a pause, a relaunch and the end, where it lands on the focus row only.
    s.apply(Action::Pause, T0 + 2 * MINUTE, id("x"));
    assert_eq!(intent_of(&mut s, Some("Outline chapter 3 again")), Ok(Some("Outline chapter 3 again".into())));
    let mut back = relaunch(&mut s, T0 + 3 * MINUTE);
    assert_eq!(back.view(T0 + 3 * MINUTE).intent.as_deref(), Some("Outline chapter 3 again"));
    back.apply(Action::Resume, T0 + 3 * MINUTE, id("x"));
    let on_break = back.apply(Action::TakeBreak, T0 + 4 * MINUTE, id("x"));
    assert_eq!(on_break.view.intent, None, "a break has no intent");
    assert_eq!(
        intent_of(&mut back, Some("late")),
        Err(TimerCommandErrorKind::WrongState),
        "break"
    );
}
