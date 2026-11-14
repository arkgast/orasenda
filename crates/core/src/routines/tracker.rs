//! The habit tracker: the dot grid's day states, the run of days and the fresh-start rule.
//!
//! Only scheduled days count: a day in the habit's weekdays, on or after the day it was created.
//! A scheduled past day with no check-in is *not done*; nothing is ever a miss. Today is still
//! open, so it can add to a run but never ends one.

use std::collections::BTreeSet;

use super::{LocalDate, Weekdays};

/// One day's state in the dot grid.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DayState {
    /// Checked in.
    Done,
    /// A scheduled past day with no check-in.
    NotDone,
    /// A day off the schedule.
    Rest,
    /// Today, scheduled and not checked in yet.
    Upcoming,
}

/// One dot in the grid.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DayDot {
    pub date: LocalDate,
    pub state: DayState,
    pub today: bool,
}

/// The last `window` local days up to and including `today`, oldest first. Days before
/// `created` are left out, not drawn as not done. A checked day is `Done`, even a rest day.
/// Today is `Upcoming` when it is scheduled and not checked yet, and `Rest` when it is off the
/// schedule.
pub fn day_states(
    created: LocalDate,
    today: LocalDate,
    days: Weekdays,
    done: &BTreeSet<LocalDate>,
    window: u16,
) -> Vec<DayDot> {
    let mut dots = Vec::with_capacity(usize::from(window));
    let mut date = today;
    for _ in 0..window {
        if date < created {
            break;
        }
        let is_today = date == today;
        let state = if done.contains(&date) {
            DayState::Done
        } else if !days.contains(date.weekday()) {
            DayState::Rest
        } else if is_today {
            DayState::Upcoming
        } else {
            DayState::NotDone
        };
        dots.push(DayDot {
            date,
            state,
            today: is_today,
        });
        date = date.pred();
    }
    dots.reverse();
    dots
}

/// The scheduled days before `today`, newest first, back to `created`.
fn scheduled_before(
    created: LocalDate,
    today: LocalDate,
    days: Weekdays,
) -> impl Iterator<Item = LocalDate> {
    std::iter::successors(Some(today.pred()), |date| Some(date.pred()))
        .take_while(move |date| *date >= created)
        .filter(move |date| days.contains(date.weekday()))
}

/// The current run of days: done scheduled days counted back from today, where one not-done
/// scheduled day is forgiven and two in a row end the run. Rest days are ignored, and today
/// adds one when it is done but never ends the run.
pub fn run_of_days(
    created: LocalDate,
    today: LocalDate,
    days: Weekdays,
    done: &BTreeSet<LocalDate>,
) -> u16 {
    if today < created {
        return 0;
    }
    let mut run: u16 = 0;
    if days.contains(today.weekday()) && done.contains(&today) {
        run = 1;
    }
    let mut one_off = false;
    for date in scheduled_before(created, today, days) {
        if done.contains(&date) {
            run = run.saturating_add(1);
            one_off = false;
        } else if one_off {
            break;
        } else {
            one_off = true;
        }
    }
    run
}

/// Whether to show the fresh-start line: the two latest scheduled days before today are both
/// not done, and today isn't done yet.
pub fn fresh_start(
    created: LocalDate,
    today: LocalDate,
    days: Weekdays,
    done: &BTreeSet<LocalDate>,
) -> bool {
    if done.contains(&today) {
        return false;
    }
    let latest: Vec<_> = scheduled_before(created, today, days).take(2).collect();
    latest.len() == 2 && latest.iter().all(|date| !done.contains(date))
}
