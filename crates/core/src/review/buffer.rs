//! The buffer suggestion, from finished tasks that had an estimate and linked focus sessions.
//!
//! Integers only. `suggested = clamp(round_to_5((ratio - 1) * 100), 25, 50)`, ties rounding up,
//! where `ratio = actual / estimated` over all eligible tasks.

use std::collections::BTreeSet;

use super::week::{shift, week_start};
use crate::routines::LocalDate;

/// Local days looked back, today included.
const WINDOW_DAYS: i32 = 56;
/// Fewest eligible tasks.
const MIN_TASKS: usize = 10;
/// Fewest distinct Monday-weeks the tasks were done in.
const MIN_WEEKS: usize = 3;
/// The Board's allowed buffer range, in steps of 5.
const MIN_PERCENT: i64 = 25;
const MAX_PERCENT: i64 = 50;

/// A suggested buffer and the numbers behind it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Suggestion {
    /// 25 to 50, in steps of 5.
    pub percent: u8,
    /// Eligible tasks.
    pub tasks: u32,
    /// Sessions estimated across them.
    pub estimated: u32,
    /// Sessions of 5 minutes or more, across them.
    pub actual: u32,
}

/// `tasks` are (done day, estimated sessions, counted sessions); the caller counts only focus
/// sessions of 5 focused minutes or more. A task with no estimate or no counted session is
/// skipped, and so is one done outside the last 56 local days. `None` below 10 tasks or 3
/// different weeks. Whether the value differs from the current buffer is the caller's check.
pub fn suggest(tasks: &[(LocalDate, u8, u32)], today: LocalDate) -> Option<Suggestion> {
    let oldest = shift(today, 1 - WINDOW_DAYS);
    let eligible: Vec<_> = tasks
        .iter()
        .filter(|(done, estimated, counted)| {
            *estimated > 0 && *counted > 0 && *done >= oldest && *done <= today
        })
        .collect();
    let weeks: BTreeSet<LocalDate> = eligible.iter().map(|task| week_start(task.0)).collect();
    if eligible.len() < MIN_TASKS || weeks.len() < MIN_WEEKS {
        return None;
    }
    let estimated: u64 = eligible.iter().map(|task| u64::from(task.1)).sum();
    let actual: u64 = eligible.iter().map(|task| u64::from(task.2)).sum();
    Some(Suggestion {
        percent: percent(estimated, actual),
        tasks: u32::try_from(eligible.len()).unwrap_or(u32::MAX),
        estimated: u32::try_from(estimated).unwrap_or(u32::MAX),
        actual: u32::try_from(actual).unwrap_or(u32::MAX),
    })
}

/// `(actual / estimated - 1) * 100` rounded to the nearest 5 (ties up), clamped to 25..=50.
/// `estimated` is above zero.
fn percent(estimated: u64, actual: u64) -> u8 {
    let est = i128::from(estimated);
    // Fives in the overshoot: 20 * (actual - est) / est, rounded half up.
    let numerator = 20 * (i128::from(actual) - est);
    let fives = (2 * numerator + est).div_euclid(2 * est);
    let value = (fives * 5).clamp(i128::from(MIN_PERCENT), i128::from(MAX_PERCENT));
    u8::try_from(value).unwrap_or(25)
}
