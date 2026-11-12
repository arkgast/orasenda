//! The deep-hours cap: the note at the crossing and the idle line.

use super::super::test_support::*;
use super::super::*;
use crate::api::MilestoneKind;

const HOUR: u64 = 60 * MINUTE;

fn deep_work_two_hour_cap() -> SessionService {
    let mut s = service();
    numbered_break_ids(&mut s);
    change_settings(&mut s, |v| {
        v.preset_id = default_id(2);
        v.deep_cap_hours = 2;
    });
    s
}

fn cap_reached(milestones: &[crate::api::MilestoneEvent]) -> usize {
    kinds(milestones)
        .iter()
        .filter(|k| **k == MilestoneKind::CapReached)
        .count()
}

#[test]
fn cap_reached_once_on_crossing() {
    let mut s = deep_work_two_hour_cap();
    // 90 minutes: under the 2-hour cap.
    let (at, first) = cycle(&mut s, "a", T0);
    assert_eq!(cap_reached(&first), 0);
    // 180 minutes: the second focus crosses it, when that focus ends.
    let started = s.apply(start(), at, id("b"));
    let crossing = s.tick(at + 90 * MINUTE);
    let order = kinds(&crossing.milestones);
    assert_eq!(
        order,
        [MilestoneKind::BreakStarted, MilestoneKind::CapReached]
    );
    assert_eq!(started.milestones.len(), 1);
    let rest = s.tick(at + 90 * MINUTE + crossing.view.remaining_ms);
    assert_eq!(
        cap_reached(&rest.milestones),
        0,
        "the break's end does not fire it again"
    );
    // Past the cap already: a third session fires nothing.
    let (_, third) = cycle(&mut s, "c", at + 3 * HOUR);
    assert_eq!(cap_reached(&third), 0);
}

#[test]
fn cap_reached_not_on_relaunch_and_not_when_off() {
    let mut s = deep_work_two_hour_cap();
    let (at, _) = cycle(&mut s, "a", T0);
    s.apply(start(), at, id("b"));
    s.tick(at + 90 * MINUTE);
    // Quit through the crossing session's break; the relaunch is past its end.
    let mut back = relaunch(&mut s, at + 4 * HOUR);
    let effects = back.tick(at + 4 * HOUR);
    assert_eq!(cap_reached(&effects.milestones), 0);

    let mut off = deep_work_two_hour_cap();
    change_settings(&mut off, |v| v.deep_cap_on = false);
    let (at, _) = cycle(&mut off, "a", T0);
    let (_, second) = cycle(&mut off, "b", at);
    assert_eq!(cap_reached(&second), 0);
    assert_eq!(off.view(T0 + 4 * HOUR).cap_line, None);
}

#[test]
fn cap_reached_counts_a_stopped_session() {
    let mut s = deep_work_two_hour_cap();
    let (at, _) = cycle(&mut s, "a", T0);
    s.apply(start(), at, id("b"));
    let stopped = s.apply(Action::Stop, at + 40 * MINUTE, id("x"));
    // 90 + 40 = 130 minutes.
    assert_eq!(cap_reached(&stopped.milestones), 1);
}

#[test]
fn cap_line_midnight_tick_once() {
    let mut s = deep_work_two_hour_cap();
    let (at, _) = cycle(&mut s, "a", T0);
    let (at, _) = cycle(&mut s, "b", at);
    // Idle and past the cap: the line shows, and a view is owed once.
    let first = s.tick(at);
    assert_eq!(
        first.view.cap_line.as_deref(),
        Some("2 hours of focus today.")
    );
    assert!(!s.tick(at + MINUTE).idle_changed, "nothing changed since");
    assert!(!s.tick(at + 10 * HOUR).idle_changed);

    // The fake local time is UTC+1, so the day ends at T0 + 23 h.
    let before = s.tick(T0 + 23 * HOUR - 1);
    assert!(!before.idle_changed);
    assert_eq!(
        before.view.cap_line.as_deref(),
        Some("2 hours of focus today.")
    );
    let midnight = s.tick(T0 + 23 * HOUR);
    assert!(midnight.idle_changed, "the new day has no focus yet");
    assert_eq!(midnight.view.cap_line, None);
    assert!(!s.tick(T0 + 23 * HOUR + 1).idle_changed);
}
