//! Unit tests for the review maths, one file per module.

mod buckets;
mod buffer;
mod habits;
mod week;

use crate::routines::LocalDate;

/// A date that is known to be valid.
pub(super) fn d(year: i32, month: u8, day: u8) -> LocalDate {
    LocalDate::new(year, month, day).expect("a valid test date")
}

/// The instant of `hour:minute` on `date` in a zone `offset_min` minutes east of UTC.
pub(super) fn at(date: LocalDate, hour: i64, minute: i64, offset_min: i64) -> u64 {
    let minutes = date.days_since_epoch() * 1440 + hour * 60 + minute - offset_min;
    u64::try_from(minutes * 60_000).expect("after 1970")
}
