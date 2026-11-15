//! Task import: the source-neutral item, the fitting of its fields to the Board's limits and
//! the mapping of Reminders and Things items (spec 2026-11-15-task-import). Pure code: no
//! host, no store.

pub(crate) mod dates;
pub(crate) mod fit;
pub(crate) mod item;
pub(crate) mod origin;
pub(crate) mod reminders;
pub(crate) mod things;
pub(crate) mod todoist;
pub(crate) mod todoist_zip;

#[cfg(test)]
mod tests;
