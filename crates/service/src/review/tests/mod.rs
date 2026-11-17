//! The review words: every quoted sentence, and the copy test.

mod copy;
mod view;
mod words;

use orasenda_core::LocalDate;

/// A date the tests name in words.
pub(super) fn date(year: i32, month: u8, day: u8) -> LocalDate {
    LocalDate::new(year, month, day).expect("a real date")
}

mod buffer;
mod stats;
mod support;
