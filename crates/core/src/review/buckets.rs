//! Calendar-anchored focus buckets for the Stats page.

use crate::routines::LocalDate;

/// The range a Stats chart covers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StatsRange {
    Week,
    Weeks8,
    Months6,
}

/// One bar: a day, a week or a month of focus.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Bucket {
    pub start: LocalDate,
    pub minutes: u32,
    pub sessions: u16,
    pub current: bool,
    pub future: bool,
}

/// The buckets for `range`, oldest first.
pub fn focus_buckets(
    sessions: &[(LocalDate, u64)],
    range: StatsRange,
    today: LocalDate,
) -> Vec<Bucket> {
    todo!("{sessions:?} {range:?} {today:?}")
}
