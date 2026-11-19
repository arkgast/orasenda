//! The Board as the webview sees it: four columns of tasks, their limits and the words around
//! them (spec 2026-11-14, §Service and IPC). Rust words every date and every total (ADR-011);
//! the webview never assembles one.

use serde::{Deserialize, Deserializer, Serialize};

use super::Lane;

/// Whether a task needs deep focus or is light work.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TaskKind {
    Deep,
    Shallow,
}

/// How much a task matters.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TaskPriority {
    High,
    Medium,
    Low,
}

/// One checklist line of a task.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistItemView {
    /// Any non-empty id, unique within the task. The webview makes it.
    pub id: String,
    /// 1 to 200 characters after trimming.
    pub text: String,
    pub done: bool,
}

/// Where a column stands against its limit. Drawn as a word and a shape, never as colour
/// alone and never as red. A column with no limit is always `Under`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum LimitState {
    Under,
    At,
    Over,
}

/// One column as the person set it (`board.columns`, an ordered list of all columns).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ColumnSettings {
    pub lane: Lane,
    /// 1 to 24 characters after trimming.
    pub name: String,
    /// Today 1 to 9, Doing 1 to 3, a custom column none or 1 to 9; Backlog and Done have none.
    pub limit: Option<u8>,
    /// Its place in the list, 0 to 7. A row from before custom columns has none: array position
    /// orders it.
    #[serde(default)]
    pub order: u8,
    /// `None` reads as the default: Done folded, the rest open.
    #[serde(default)]
    pub folded: Option<bool>,
}

/// A task as the board shows it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TaskView {
    /// A UUIDv7.
    pub id: String,
    pub title: String,
    pub notes: String,
    pub tags: Vec<String>,
    pub kind: TaskKind,
    /// Sessions, 1 to 16; `None` is "No estimate".
    pub estimate: Option<u8>,
    /// The estimate with the buffer, rounded up; `None` without an estimate.
    pub planned: Option<u32>,
    /// A local date, `YYYY-MM-DD`.
    pub due: Option<String>,
    /// "Due today", "Due yesterday", "Due tomorrow" or "Due Fri 20 Nov". Never "overdue".
    pub due_label: Option<String>,
    pub priority: Option<TaskPriority>,
    pub checklist: Vec<ChecklistItemView>,
    pub lane: Lane,
    /// This task is today's Frog.
    pub is_frog: bool,
    /// "Keep as is" was chosen on the breakdown prompt.
    pub breakdown_dismissed: bool,
    /// The Inbox note it came from.
    pub source_note_id: Option<String>,
    /// When it moved to Done, in epoch milliseconds.
    #[specta(type = Option<specta_typescript::Number>)]
    pub done_at: Option<u64>,
    /// Focused time on it, worded: "0h 41m".
    pub tracked: String,
    #[specta(type = specta_typescript::Number)]
    pub tracked_ms: u64,
    /// Focus sessions linked to it.
    pub sessions: u32,
    /// A session is running on it.
    pub active: bool,
    /// A priority of the current week (`week_start(today)`), never the planned week.
    pub week_priority: bool,
}

/// One column with its tasks in order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ColumnView {
    pub lane: Lane,
    pub name: String,
    pub limit: Option<u8>,
    /// A column the person made (`c_…`), not one of the four built-ins.
    pub custom: bool,
    /// Folded to its header. Saved with the column.
    pub folded: bool,
    /// The tasks shown in it (Done counts the last 14 days only).
    pub count: u32,
    pub state: LimitState,
    pub tasks: Vec<TaskView>,
}

/// Everything the Board page shows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BoardView {
    /// Backlog, Today, Doing and Done, with the custom columns between, in board order.
    pub columns: Vec<ColumnView>,
    /// The estimate buffer, whole percent.
    pub buffer: u8,
    /// Today's local date, `YYYY-MM-DD`.
    pub today: String,
    /// The planned sessions of the Today tasks that have an estimate.
    pub today_planned: u32,
}

/// A task to add, as typed. The service trims it. Only the title is required.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TaskDraft {
    pub title: String,
    /// Backlog when absent.
    #[serde(default)]
    pub lane: Option<Lane>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    /// Deep when absent.
    #[serde(default)]
    pub kind: Option<TaskKind>,
    #[serde(default)]
    pub estimate: Option<u8>,
    #[serde(default)]
    pub due: Option<String>,
    #[serde(default)]
    pub priority: Option<TaskPriority>,
}

/// The fields of a task to change. A field left out stays; a nullable field set to `null`
/// clears. Only changed fields are written.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TaskPatchView {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub kind: Option<TaskKind>,
    #[serde(default, deserialize_with = "clearable")]
    #[specta(type = Option<u8>)]
    pub estimate: Option<Option<u8>>,
    #[serde(default, deserialize_with = "clearable")]
    #[specta(type = Option<String>)]
    pub due: Option<Option<String>>,
    #[serde(default, deserialize_with = "clearable")]
    #[specta(type = Option<TaskPriority>)]
    pub priority: Option<Option<TaskPriority>>,
    #[serde(default)]
    pub checklist: Option<Vec<ChecklistItemView>>,
    #[serde(default)]
    pub breakdown_dismissed: Option<bool>,
}

/// Tells a field that is absent (`None`, leave it) from one that is `null` (`Some(None)`,
/// clear it).
fn clearable<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

/// Why a board command did nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum BoardError {
    /// A title of nothing but whitespace.
    TitleEmpty,
    /// A title over 200 characters.
    TitleTooLong,
    /// Notes over 10 000 characters.
    NotesTooLong,
    /// More than 8 tags, or one that is empty, over 24 characters or repeated.
    BadTags,
    /// An estimate outside 1 to 16 sessions.
    BadEstimate,
    /// A due date that is not a real `YYYY-MM-DD`.
    BadDue,
    /// More than 30 checklist items, or one that is empty, over 200 characters or repeated.
    BadChecklist,
    /// A column that can't be added after, or removed: a built-in, or after Done or an unknown
    /// column.
    BadColumns,
    /// Four custom columns already.
    TooManyColumns,
    /// A column that still holds a task can't be removed.
    ColumnNotEmpty,
    /// No such column on this board.
    ColumnNotFound,
    /// A column name that is empty, over 24 characters or already taken.
    BadColumnName,
    /// A limit outside the column's range, or one on a column that has none.
    BadLimit,
    /// A Done task can't be made the Frog.
    DoneCannotBeFrog,
    /// No such task or note, or it is already in the state asked for.
    NotFound,
    /// The store is unavailable or the write failed.
    Store,
}

/// What a start did to the board that the person should be told, as a toast.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum BoardNoticeKind {
    /// Starting went past the Doing limit, so the longest task there went back to Today.
    MovedBack,
    /// The board write at a start failed. The session started anyway.
    NotSaved,
}

/// `board-notice`: a line to show after a start, in the words to show.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BoardNotice {
    pub kind: BoardNoticeKind,
    pub message: String,
}
