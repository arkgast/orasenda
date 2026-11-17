//! Every sentence, label and duration the Review page shows, worded in Rust (ADR-011). Plain
//! and kind: no exclamation marks, no percentages except the buffer's own setting, and never
//! *missed*, *failed*, *broken*, *streak* or *lost*. Stats words are in [`stats`], the shutdown
//! and weekly flow words in [`flows`].

// The words are called by the stats (V9), the view (V10), the shutdown (V16a, V18) and the
// nudge (V21) tasks; until they land, nothing outside the tests uses them.
#![allow(dead_code, unused_imports)]

mod flows;
mod stats;

pub(crate) use flows::*;
pub(crate) use stats::*;

use orasenda_core::LocalDate;

const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/// "1 session" or "3 sessions".
pub(crate) fn count(n: u32, one: &str, many: &str) -> String {
    if n == 1 {
        format!("1 {one}")
    } else {
        format!("{n} {many}")
    }
}

/// "16 November".
pub(crate) fn day_month(date: LocalDate) -> String {
    format!("{} {}", date.day(), month_name(date))
}

/// "November".
pub(crate) fn month_name(date: LocalDate) -> &'static str {
    MONTHS[usize::from(date.month() - 1)]
}
