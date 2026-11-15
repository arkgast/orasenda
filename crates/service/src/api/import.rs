//! Task import as the webview sees it: the sources, the preview and the errors (spec
//! 2026-11-15-task-import, Service). Every line of words is made in Rust (ADR-011).

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use super::Lane;

/// Where tasks can be imported from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ImportSourceKind {
    Reminders,
    Todoist,
    Things,
}

impl ImportSourceKind {
    /// The name the preview and the errors use.
    pub fn name(self) -> &'static str {
        match self {
            ImportSourceKind::Reminders => "Apple Reminders",
            ImportSourceKind::Todoist => "Todoist",
            ImportSourceKind::Things => "Things",
        }
    }
}

/// One source in the picker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportSourceView {
    pub kind: ImportSourceKind,
    pub available: bool,
    /// Why it can't be picked now; set only when `available` is false.
    pub reason: Option<String>,
}

/// The sources this build offers, in the order Reminders, Todoist, Things.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportSourcesView {
    pub sources: Vec<ImportSourceView>,
}

/// What to read. Todoist carries the file the user chose; the app crate shows the panel.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PreviewRequest {
    Reminders,
    Things,
    Todoist(PathBuf),
}

/// One row of the preview.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportItemView {
    /// The row's place in the source's order; `task_import` takes these back.
    pub key: u32,
    pub title: String,
    /// `Work · Planning · Due Fri 20 Nov · 4 checklist items`; empty when there is nothing to say.
    pub meta: String,
    /// "Already on the Board, in Today"; set only for a row with a live match.
    pub why: Option<String>,
    pub selected: bool,
    pub on_board: Option<Lane>,
}

/// What a source holds, shown before anything is written.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    /// A per-process counter. Exported as `number`: lossless below 2^53.
    #[specta(type = specta_typescript::Number)]
    pub id: u64,
    pub source: ImportSourceKind,
    pub source_name: String,
    /// At most 500 rows, in the source's order.
    pub items: Vec<ImportItemView>,
    /// Open items the source holds, before the 500-row cap.
    pub total: u32,
    /// Reserved for a line above the list. The cap's line is the first of `summary`.
    pub line: Option<String>,
    pub summary: Vec<String>,
}

/// A committed import.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportDone {
    /// Exported as `number`: lossless below 2^53.
    #[specta(type = specta_typescript::Number)]
    pub import_id: u64,
    pub count: u32,
}

/// Why an import step did not happen.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ImportErrorKind {
    Denied,
    NotInstalled,
    Unavailable,
    SessionActive,
    NotAnExport,
    Unreadable,
    TooLarge,
    TimedOut,
    Stale,
    Store,
}

/// An import failure and the line the UI shows for it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ImportError {
    pub kind: ImportErrorKind,
    pub message: String,
}

impl ImportError {
    pub fn new(kind: ImportErrorKind, message: &str) -> Self {
        Self {
            kind,
            message: message.to_owned(),
        }
    }

    /// The source is disabled while a session runs.
    pub fn session_active() -> Self {
        Self::new(ImportErrorKind::SessionActive, SESSION_ACTIVE)
    }

    /// The preview is not the pending one, or a key is not in it.
    pub fn stale() -> Self {
        Self::new(
            ImportErrorKind::Stale,
            "That preview is out of date. Choose the source again.",
        )
    }

    /// A store read or write failed.
    pub fn store(message: &str) -> Self {
        Self::new(ImportErrorKind::Store, message)
    }
}

/// Why Reminders and Things wait for the end of a session.
pub const SESSION_ACTIVE: &str = "Available between sessions, so nothing interrupts your focus.";
/// Why Reminders can't be read outside the installed app.
pub const REMINDERS_UNBUNDLED: &str = "Reminders works in the installed app only.";
