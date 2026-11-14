//! `routines-changed` once at local midnight, from the scheduler tick.

use super::*;
use crate::api::HabitDayState;
use crate::scheduler::iterate;
use crate::session::test_support::{MINUTE, T0};

fn routines_events(host: &TestHost) -> usize {
    host.log()
        .count(|event| matches!(event, Event::RoutinesChanged(_)))
}

#[test]
fn the_tick_emits_routines_changed_once_at_local_midnight() {
    let host = host();
    let id = super::super::run_habit_create(&host, None, &habit("Walk")).unwrap();
    host.log().take();
    // T0 is 01:00 local (UTC+1). The first tick only records the day.
    iterate(&host);
    host.set_now(T0 + 22 * HOUR + 59 * MINUTE);
    iterate(&host);
    assert_eq!(routines_events(&host), 0, "no event within the day");
    // 00:00 local on Sunday.
    host.set_now(T0 + 23 * HOUR);
    iterate(&host);
    let views = changed(&host);
    assert_eq!(views.len(), 1);
    let dots = &views[0].habits[0].dots;
    assert_eq!(views[0].habits[0].id, id);
    assert_eq!(dots.len(), 2, "the grid rolled over");
    assert_eq!(dots[0].state, HabitDayState::NotDone);
    assert_eq!(dots[1].state, HabitDayState::Upcoming);
    assert_eq!(under_lock(&host), 0);
    host.set_now(T0 + 23 * HOUR + MINUTE);
    iterate(&host);
    assert_eq!(routines_events(&host), 0, "once per day");
}

#[test]
fn a_tick_after_a_sleep_past_midnight_still_emits() {
    let host = host();
    iterate(&host);
    host.log().take();
    host.set_now(T0 + 3 * DAY + 5 * HOUR);
    iterate(&host);
    assert_eq!(changed(&host).len(), 1);
}

#[test]
fn a_failed_read_at_midnight_emits_nothing() {
    let host = host();
    iterate(&host);
    host.log().take();
    crate::session::test_support::db(&crate::session::lock(&host.0.service)).fail_reads(true);
    host.set_now(T0 + DAY);
    iterate(&host);
    crate::session::test_support::db(&crate::session::lock(&host.0.service)).fail_reads(false);
    assert!(changed(&host).is_empty());
}
