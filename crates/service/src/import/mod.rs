//! Task import: the source-neutral item, the fitting of its fields to the Board's limits and
//! the mapping of Reminders and Things items (spec 2026-11-15-task-import). Pure code: no
//! host, no store; `preview` reads a source and `pending` keeps what it found.

pub(crate) mod dates;
pub(crate) mod fit;
pub(crate) mod item;
pub(crate) mod origin;
pub(crate) mod pending;
pub(crate) mod preview;
pub(crate) mod reminders;
pub(crate) mod things;
pub(crate) mod todoist;
pub(crate) mod todoist_zip;
pub(crate) mod view;

pub use pending::run_import_discard;
pub(crate) use pending::{LastImport, PendingPreview};
pub use preview::{run_import_preview, run_import_sources};

#[cfg(test)]
mod tests;
