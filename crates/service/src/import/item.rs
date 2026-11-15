//! The item every source parser yields, before its fields are fitted to the Board's limits.

use crate::api::TaskPriority;

/// One source item as the source wrote it. Parsers yield these in source order.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(crate) struct RawItem {
    /// `<source>:<key>`.
    pub origin: String,
    pub title: String,
    /// The source's notes, URL included.
    pub notes: String,
    /// In the order they should be kept.
    pub tags: Vec<String>,
    pub priority: Option<TaskPriority>,
    /// `YYYY-MM-DD`, only when the source gave one absolute date.
    pub due: Option<String>,
    pub checklist: Vec<String>,
    /// Date text that is not a due date (`Reminders time: 15:00`); it goes to the notes.
    pub date_lines: Vec<String>,
}
