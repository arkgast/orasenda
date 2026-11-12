//! Relaunch recovery with a break and the warning.

use orasenda_core::{EndReason, EngineState, Phase, SessionId};

use super::super::test_support::*;
use super::super::*;
use crate::api::{MilestoneKind, Mode};

fn on_break() -> SessionService {
    let mut s = service();
    numbered_break_ids(&mut s);
    s.apply(start(), T0, id("a"));
    s.tick(T0 + CLASSIC_MS);
    s
}

#[test]
fn recovery_mid_break_continues() {
    let mut s = on_break();
    let now = T0 + CLASSIC_MS + 2 * MINUTE;
    let mut back = relaunch(&mut s, now);
    let view = back.view(now);
    assert_eq!(
        (view.state, view.mode, view.phase),
        (EngineState::Running, Mode::Break, Phase::Break)
    );
    assert_eq!(view.remaining_ms, 3 * MINUTE);
    assert_eq!(view.session_id, Some(SessionId("brk-1".into())));
    assert!(back.state(now).0.pending.is_empty());
    assert_eq!(row_count(db(&back)), 0);
    // It then ends like any break, with both rows and the same ids.
    back.tick(T0 + CLASSIC_END_MS);
    assert_eq!(row_count(db(&back)), 2);
}

#[test]
fn recovery_after_the_break_ended_writes_both_rows_and_says_so() {
    let mut s = on_break();
    let back = relaunch(&mut s, T0 + 60 * MINUTE);
    assert_eq!(back.view(T0 + 60 * MINUTE).state, EngineState::Idle);
    assert_eq!(row_count(db(&back)), 2);
    assert_eq!(
        back.pending,
        [milestone_in(
            MilestoneKind::Recovered,
            Some(EndReason::Completed),
            "a",
            Phase::Break
        )]
    );
    assert_eq!(snapshot(db(&back)), None);
}

#[test]
fn a_break_cut_by_a_crash_writes_the_open_focus_from_the_snapshot() {
    let mut s = on_break();
    let now = T0 + CLASSIC_MS + 2 * MINUTE;
    let store = s.store.take().expect("store");
    store.fail_reads(true);
    let mut back = SessionService::new(
        Ok(store),
        fakes(orasenda_core::NotificationStatus::NotDetermined, false).platform,
        now,
    );
    db(&back).fail_reads(false);
    // The snapshot was never read; the next write records what it held.
    back.apply(start(), now, id("b"));
    assert_eq!(row_count(db(&back)), 2);
    assert_eq!(
        stored_rows(db(&back)),
        ["a:focus:completed", "brk-1:break:stopped"]
    );
}

#[test]
fn relaunch_in_warning_does_not_warn_again() {
    // Warned before the quit.
    let mut s = service();
    s.apply(start(), T0, id("a"));
    let warned = s.tick(T0 + 23 * MINUTE);
    assert_eq!(kinds(&warned.milestones), [MilestoneKind::Warned]);
    let now = T0 + 24 * MINUTE;
    let mut back = relaunch(&mut s, now);
    assert_eq!(back.view(now).mode, Mode::Warning);
    assert!(back.tick(now).milestones.is_empty());
    assert!(!back.tick(now + 1_000).warned);

    // Quit before the warning, back inside the last two minutes: it was never shown, and it is
    // not shown late.
    let mut s = service();
    s.apply(start(), T0, id("a"));
    let mut back = relaunch(&mut s, now);
    let effects = back.tick(now);
    assert!(effects.milestones.is_empty());
    assert!(!effects.warned);
    assert_eq!(effects.view.mode, Mode::Warning);
}
