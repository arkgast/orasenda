use std::collections::BTreeSet;

use super::d;
use crate::routines::{
    DayDot, DayState, LocalDate, Weekdays, day_states, fresh_start, run_of_days,
};

/// Saturday 14 November 2026.
fn today() -> LocalDate {
    d(2026, 11, 14)
}

/// `n` days before `today()`.
fn ago(n: u16) -> LocalDate {
    (0..n).fold(today(), |day, _| day.pred())
}

fn done(days_ago: &[u16]) -> BTreeSet<LocalDate> {
    days_ago.iter().map(|&n| ago(n)).collect()
}

fn states(dots: &[DayDot]) -> Vec<DayState> {
    dots.iter().map(|dot| dot.state).collect()
}

const EVERY: Weekdays = Weekdays::EVERY_DAY;

#[test]
fn day_states_covers_the_window_oldest_first() {
    let dots = day_states(ago(100), today(), EVERY, &BTreeSet::new(), 28);
    assert_eq!(dots.len(), 28);
    assert_eq!(dots[0].date, ago(27));
    assert_eq!(dots[27].date, today());
    assert!(dots[27].today);
    assert!(dots[..27].iter().all(|dot| !dot.today));
    assert!(dots.windows(2).all(|w| w[0].date.succ() == w[1].date));
}

#[test]
fn day_states_leaves_out_the_days_before_the_habit_was_created() {
    let dots = day_states(ago(3), today(), EVERY, &BTreeSet::new(), 28);
    assert_eq!(dots.len(), 4);
    assert_eq!(dots[0].date, ago(3));
    assert!(day_states(today().succ(), today(), EVERY, &BTreeSet::new(), 28).is_empty());
    assert!(day_states(ago(10), today(), EVERY, &BTreeSet::new(), 0).is_empty());
}

#[test]
fn today_is_done_or_upcoming_on_a_scheduled_day() {
    let unchecked = day_states(ago(5), today(), EVERY, &BTreeSet::new(), 28);
    assert_eq!(
        unchecked.last().map(|dot| dot.state),
        Some(DayState::Upcoming)
    );
    let checked = day_states(ago(5), today(), EVERY, &done(&[0]), 28);
    assert_eq!(checked.last().map(|dot| dot.state), Some(DayState::Done));
}

#[test]
fn today_off_the_schedule_rests_unless_checked() {
    // Saturday on a weekdays habit.
    let unchecked = day_states(ago(5), today(), Weekdays::WEEKDAYS, &BTreeSet::new(), 28);
    assert_eq!(unchecked.last().map(|dot| dot.state), Some(DayState::Rest));
    let checked = day_states(ago(5), today(), Weekdays::WEEKDAYS, &done(&[0]), 28);
    assert_eq!(checked.last().map(|dot| dot.state), Some(DayState::Done));
}

#[test]
fn past_days_are_done_not_done_or_rest() {
    // Sun 8 to Sat 14, weekdays only; done on Mon and Wed, and on Sunday the 8th (a rest day).
    let dots = day_states(ago(6), today(), Weekdays::WEEKDAYS, &done(&[5, 3, 6]), 28);
    use DayState::*;
    assert_eq!(
        states(&dots),
        vec![Done, Done, NotDone, Done, NotDone, NotDone, Rest]
    );
}

#[test]
fn run_of_days_counts_done_scheduled_days() {
    assert_eq!(
        run_of_days(ago(100), today(), EVERY, &done(&[0, 1, 2, 3, 4])),
        5
    );
    assert_eq!(run_of_days(ago(100), today(), EVERY, &BTreeSet::new()), 0);
}

#[test]
fn today_never_breaks_a_run() {
    assert_eq!(
        run_of_days(ago(100), today(), EVERY, &done(&[1, 2, 3, 4, 5])),
        5
    );
}

#[test]
fn one_miss_is_forgiven() {
    assert_eq!(
        run_of_days(ago(100), today(), EVERY, &done(&[1, 2, 4, 5])),
        4
    );
    // Yesterday is not done, but a single miss is forgiven: the run holds.
    assert_eq!(run_of_days(ago(100), today(), EVERY, &done(&[2, 3])), 2);
    // Single misses apart from each other are each forgiven.
    assert_eq!(
        run_of_days(ago(100), today(), EVERY, &done(&[0, 2, 4, 6])),
        4
    );
}

#[test]
fn two_misses_in_a_row_end_the_run() {
    assert_eq!(
        run_of_days(ago(100), today(), EVERY, &done(&[1, 4, 5, 6, 7, 8])),
        1
    );
    assert_eq!(run_of_days(ago(100), today(), EVERY, &done(&[3, 4, 5])), 0);
}

#[test]
fn rest_days_are_ignored() {
    // Weekdays only. Today is Saturday; done Mon 9 to Fri 13 and Fri 6. The weekend between is rest.
    let checks = done(&[1, 2, 3, 4, 5, 8]);
    assert_eq!(
        run_of_days(ago(100), today(), Weekdays::WEEKDAYS, &checks),
        6
    );
    // A check-in on a rest day doesn't add to the run.
    let with_saturday = done(&[0, 1, 2]);
    assert_eq!(
        run_of_days(ago(100), today(), Weekdays::WEEKDAYS, &with_saturday),
        2
    );
}

#[test]
fn run_of_days_starts_at_creation() {
    assert_eq!(run_of_days(ago(2), today(), EVERY, &done(&[1, 2, 3, 4])), 2);
    assert_eq!(run_of_days(today().succ(), today(), EVERY, &done(&[0])), 0);
}

#[test]
fn fresh_start_after_two_days_off() {
    assert!(fresh_start(ago(100), today(), EVERY, &done(&[3, 4])));
    assert!(fresh_start(ago(100), today(), EVERY, &BTreeSet::new()));
}

#[test]
fn no_fresh_start_once_today_is_done() {
    assert!(!fresh_start(ago(100), today(), EVERY, &done(&[0, 3])));
}

#[test]
fn no_fresh_start_after_one_day_off() {
    assert!(!fresh_start(ago(100), today(), EVERY, &done(&[2])));
    assert!(!fresh_start(ago(100), today(), EVERY, &done(&[1])));
}

#[test]
fn fresh_start_skips_rest_days() {
    // Monday 16 November on a weekdays habit: Friday and Thursday are the two latest scheduled days.
    let monday = d(2026, 11, 16);
    let thursday_done: BTreeSet<_> = [d(2026, 11, 12)].into_iter().collect();
    assert!(fresh_start(
        ago(100),
        monday,
        Weekdays::WEEKDAYS,
        &BTreeSet::new()
    ));
    assert!(!fresh_start(
        ago(100),
        monday,
        Weekdays::WEEKDAYS,
        &thursday_done
    ));
}

#[test]
fn no_fresh_start_without_two_scheduled_days_since_creation() {
    assert!(!fresh_start(ago(1), today(), EVERY, &BTreeSet::new()));
    assert!(!fresh_start(today(), today(), EVERY, &BTreeSet::new()));
    assert!(fresh_start(ago(2), today(), EVERY, &BTreeSet::new()));
}
