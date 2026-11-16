//! Calendar-anchored focus buckets for the Stats page.
//!
//! Week is seven days, Monday to Sunday of the current week. Weeks8 is the current partial week
//! plus the seven before it. Months6 is the current partial month plus the five before it.
//! Callers turn every session's instant into a date with today's offset.

use super::week::{shift, week_start};
use crate::routines::LocalDate;

const MINUTE_MS: u64 = 60_000;

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
    /// The first day of the bucket.
    pub start: LocalDate,
    /// Focused minutes, rounded down from the bucket's total.
    pub minutes: u32,
    pub sessions: u16,
    /// The bucket that contains today.
    pub current: bool,
    /// A day after today (the Week range only).
    pub future: bool,
}

/// The buckets for `range`, oldest first. `sessions` are (local start date, focused ms).
/// Sessions outside the range are ignored.
pub fn focus_buckets(
    sessions: &[(LocalDate, u64)],
    range: StatsRange,
    today: LocalDate,
) -> Vec<Bucket> {
    let starts = bucket_starts(range, today);
    let mut totals = vec![(0u64, 0u32); starts.len()];
    for (date, focused_ms) in sessions {
        // Days after today are empty.
        if *date > today {
            continue;
        }
        // The bucket whose start is the latest one on or before the date.
        let Some(index) = starts.iter().rposition(|start| start <= date) else {
            continue;
        };
        let in_range = match starts.get(index + 1) {
            Some(next) => date < next,
            None => *date <= end_of(range, starts[index]),
        };
        if in_range {
            let total = &mut totals[index];
            total.0 = total.0.saturating_add(*focused_ms);
            total.1 = total.1.saturating_add(1);
        }
    }
    starts
        .iter()
        .zip(totals)
        .map(|(start, (ms, count))| Bucket {
            start: *start,
            minutes: u32::try_from(ms / MINUTE_MS).unwrap_or(u32::MAX),
            sessions: u16::try_from(count).unwrap_or(u16::MAX),
            current: contains(range, *start, today),
            future: *start > today,
        })
        .collect()
}

/// The first day of each bucket, oldest first.
fn bucket_starts(range: StatsRange, today: LocalDate) -> Vec<LocalDate> {
    match range {
        StatsRange::Week => {
            let monday = week_start(today);
            (0..7).map(|i| shift(monday, i)).collect()
        }
        StatsRange::Weeks8 => {
            let monday = week_start(today);
            (0..8).map(|i| shift(monday, 7 * (i - 7))).collect()
        }
        StatsRange::Months6 => {
            let (year, month) = (today.year(), i32::from(today.month()));
            (0..6)
                .map(|i| {
                    let index = year * 12 + (month - 1) - (5 - i);
                    let (y, m) = (index.div_euclid(12), index.rem_euclid(12) + 1);
                    LocalDate::new(y, u8::try_from(m).unwrap_or(1), 1).unwrap_or(today)
                })
                .collect()
        }
    }
}

/// The last day of the bucket that starts at `start`.
fn end_of(range: StatsRange, start: LocalDate) -> LocalDate {
    match range {
        StatsRange::Week => start,
        StatsRange::Weeks8 => shift(start, 6),
        StatsRange::Months6 => {
            let next = if start.month() == 12 {
                LocalDate::new(start.year() + 1, 1, 1)
            } else {
                LocalDate::new(start.year(), start.month() + 1, 1)
            };
            next.map_or(start, LocalDate::pred)
        }
    }
}

/// Whether the bucket that starts at `start` holds `date`.
fn contains(range: StatsRange, start: LocalDate, date: LocalDate) -> bool {
    start <= date && date <= end_of(range, start)
}
