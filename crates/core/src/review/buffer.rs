//! The buffer suggestion.

use crate::routines::LocalDate;

/// A suggested buffer and the numbers behind it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Suggestion {
    pub percent: u8,
    pub tasks: u32,
    pub estimated: u32,
    pub actual: u32,
}

/// `tasks` are (done day, estimated sessions, counted sessions).
pub fn suggest(tasks: &[(LocalDate, u8, u32)], today: LocalDate) -> Option<Suggestion> {
    todo!("{tasks:?} {today:?}")
}
