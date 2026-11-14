//! Unit tests for the routines domain, one file per module.

mod date;
mod due;
mod templates;
mod tracker;
mod weekdays;

use super::LocalDate;

/// A date that is known to be valid.
pub(super) fn d(year: i32, month: u8, day: u8) -> LocalDate {
    LocalDate::new(year, month, day).expect("a valid test date")
}
