//! Days done for the habit lines.

use std::collections::BTreeSet;

use crate::routines::LocalDate;

/// Days done in `from..=to`, counted from `created` when that is later, and the creation day
/// when it falls after `from` and inside the range (so the line can say "since 3 November").
/// A habit that existed for the whole range has no `since`. No denominator.
pub fn days_done(
    created: LocalDate,
    from: LocalDate,
    to: LocalDate,
    done: &[LocalDate],
) -> (u32, Option<LocalDate>) {
    let start = created.max(from);
    let days: BTreeSet<LocalDate> = done
        .iter()
        .copied()
        .filter(|day| *day >= start && *day <= to)
        .collect();
    let count = u32::try_from(days.len()).unwrap_or(u32::MAX);
    let since = (created > from && created <= to).then_some(created);
    (count, since)
}
