//! Days done for the habit lines.

use crate::routines::LocalDate;

/// Days done in `from..=to`, counted from `created` when that is later, and the creation day
/// when it falls inside the range.
pub fn days_done(
    created: LocalDate,
    from: LocalDate,
    to: LocalDate,
    done: &[LocalDate],
) -> (u32, Option<LocalDate>) {
    todo!("{created:?} {from:?} {to:?} {done:?}")
}
