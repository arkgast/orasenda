//! The keep-going offer after a `quick` session.

use orasenda_core::EngineState;

use super::super::test_support::*;
use super::super::*;
use crate::api::{MilestoneKind, Offer};

const QUICK_END: u64 = T0 + 2 * MINUTE;

#[test]
fn offer_lifecycle() {
    let mut s = service();
    s.apply(start_quick(), T0, id("q"));
    assert_eq!(s.view(T0 + MINUTE).offer, None, "not while it runs");
    let ended = s.tick(QUICK_END);
    assert_eq!(ended.view.offer, Some(Offer::KeepGoing));
    assert!(ended.quick_completed);
    assert_eq!(ended.view.state, EngineState::Idle);
    let ended_event = &ended.milestones[0];
    assert!(ended_event.quick);
    assert_eq!(ended_event.kind, MilestoneKind::Ended);

    // It stays until something clears it, and starts nothing by itself.
    assert_eq!(
        s.tick(QUICK_END + 30 * MINUTE).view.offer,
        Some(Offer::KeepGoing)
    );
    // "Stop here" clears it, and clearing twice is fine.
    let dismissed = s.apply(Action::DismissOffer, QUICK_END + MINUTE, id("x"));
    assert_eq!(dismissed.result, Ok(dismissed.view.clone()));
    assert_eq!(dismissed.view.offer, None);
    assert!(
        s.apply(Action::DismissOffer, QUICK_END + MINUTE, id("x"))
            .result
            .is_ok()
    );

    // "Keep going" is a start: it clears the offer.
    s.apply(start_quick(), QUICK_END + 2 * MINUTE, id("q2"));
    s.tick(QUICK_END + 4 * MINUTE);
    assert_eq!(s.view(QUICK_END + 4 * MINUTE).offer, Some(Offer::KeepGoing));
    let started = s.apply(start(), QUICK_END + 4 * MINUTE, id("a"));
    assert_eq!(started.view.offer, None);
    assert_eq!(started.view.state, EngineState::Running);
}

#[test]
fn stopping_a_quick_session_early_offers_nothing() {
    let mut s = service();
    s.apply(start_quick(), T0, id("q"));
    let stopped = s.apply(Action::Stop, T0 + MINUTE, id("x"));
    assert_eq!(stopped.view.offer, None);
    assert!(!stopped.quick_completed);
}

#[test]
fn a_relaunch_forgets_the_offer() {
    let mut s = service();
    s.apply(start_quick(), T0, id("q"));
    s.tick(QUICK_END);
    let back = relaunch(&mut s, QUICK_END + MINUTE);
    assert_eq!(back.view(QUICK_END + MINUTE).offer, None);
}

#[test]
fn a_quick_session_rolls_on_with_auto_continue() {
    let mut s = service();
    change_settings(&mut s, |v| v.auto_continue = true);
    s.apply(start_quick(), T0, id("q"));
    let rolled = s.tick(QUICK_END);
    assert_eq!(rolled.view.state, EngineState::Running);
    assert!(!rolled.view.quick, "the saved preset runs now");
    assert_eq!(rolled.view.offer, None);
    assert_eq!(
        kinds(&rolled.milestones),
        [MilestoneKind::Ended, MilestoneKind::Started]
    );
    assert_eq!(rolled.view.remaining_ms, CLASSIC_MS);
}
