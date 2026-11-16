//! Monday weeks, the planned week and the shutdown day.

use crate::routines::LocalDate;

/// The Monday of the week that contains `date`.
pub fn week_start(date: LocalDate) -> LocalDate {
    todo!("{date:?}")
}

/// The Monday of the week the weekly review plans.
pub fn planned_week(today: LocalDate) -> LocalDate {
    todo!("{today:?}")
}

/// The Monday and Sunday of the week before `planned`.
pub fn look_back(planned: LocalDate) -> (LocalDate, LocalDate) {
    todo!("{planned:?}")
}

/// The date a shutdown started at `epoch_ms` belongs to.
pub fn shutdown_day(epoch_ms: u64, offset_min: i32) -> LocalDate {
    todo!("{epoch_ms} {offset_min}")
}
