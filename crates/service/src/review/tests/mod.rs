//! The review words: every quoted sentence, and the copy test.

mod copy;
mod shutdown;
mod tomorrow;
mod nudge;
mod view;
mod words;

use orasenda_core::LocalDate;

/// A date the tests name in words.
pub(super) fn date(year: i32, month: u8, day: u8) -> LocalDate {
    LocalDate::new(year, month, day).expect("a real date")
}

mod buffer;
mod look_back;
mod stats;
mod support;
mod undo;
mod weekly_save;
