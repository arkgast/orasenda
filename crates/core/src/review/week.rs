//! Monday weeks, the planned week and the shutdown day.

use crate::routines::{LocalDate, Weekday};

/// Minutes before local 04:00 that still belong to the previous date.
const SHUTDOWN_CUTOFF_MIN: i32 = 4 * 60;

/// `date` moved by `days` (negative goes back).
pub(super) fn shift(date: LocalDate, days: i32) -> LocalDate {
    let step = |from: LocalDate| if days < 0 { from.pred() } else { from.succ() };
    (0..days.unsigned_abs()).fold(date, |acc, _| step(acc))
}

/// The Monday of the week that contains `date`.
pub fn week_start(date: LocalDate) -> LocalDate {
    shift(date, -i32::from(date.weekday().index()))
}

/// The Monday of the week the weekly review plans: this week from Monday to Thursday, next
/// week from Friday to Sunday.
pub fn planned_week(today: LocalDate) -> LocalDate {
    let monday = week_start(today);
    if today.weekday() >= Weekday::Friday {
        shift(monday, 7)
    } else {
        monday
    }
}

/// The Monday and the Sunday of the week before `planned`, the week the review looks back on.
pub fn look_back(planned: LocalDate) -> (LocalDate, LocalDate) {
    (shift(planned, -7), shift(planned, -1))
}

/// The date a shutdown started at `epoch_ms` belongs to: before 04:00 local it is still the
/// previous date.
pub fn shutdown_day(epoch_ms: u64, offset_min: i32) -> LocalDate {
    LocalDate::from_epoch_ms(epoch_ms, offset_min.saturating_sub(SHUTDOWN_CUTOFF_MIN))
}
