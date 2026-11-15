//! The API contract for the focus session loop: every type the webview sees. The app crate
//! types them for the webview with tauri-specta (ADR-007); `src/shared/ipc/bindings.ts` is generated
//! from these.

mod board;
mod data;
mod errors;
mod events;
mod hint;
mod import;
mod inbox;
mod keyboard;
mod presets;
mod routines;
mod settings;
#[cfg(test)]
mod tests;
mod timer;
mod tips;

pub use board::{
    BoardError, BoardNotice, BoardNoticeKind, BoardView, ChecklistItemView, ColumnSettings,
    ColumnView, Lane, LimitState, TaskDraft, TaskKind, TaskPatchView, TaskPriority, TaskView,
};
pub use data::{
    BackupEntry, BackupFrequency, BackupKind, BackupPolicy, DataCounts, DataError, DataErrorKind,
    DataOverview, ExportOutcome, ImportOutcome, ImportReport,
};
pub use errors::{
    NotificationsError, NotificationsErrorKind, SettingsError, SettingsErrorKind,
    TimerCommandError, TimerCommandErrorKind,
};
pub use events::{MilestoneEvent, MilestoneKind, NavigatePage};
pub use hint::Hint;
pub use import::{
    ImportDone, ImportError, ImportErrorKind, ImportItemView, ImportPreview, ImportSourceKind,
    ImportSourceView, ImportSourcesView, PreviewRequest, REMINDERS_UNBUNDLED, SESSION_ACTIVE,
};
pub use inbox::{CaptureError, InboxError, NewCapture, NoteKind, NoteView};
pub use keyboard::{
    ActionView, BindingView, FixedKeyView, GlobalBindingView, KeyboardError, KeyboardView,
    ShortcutStatus,
};
pub use presets::{PresetEntry, PresetError, PresetErrorKind, PresetPatch, entries};
pub use routines::{
    HabitDayState, HabitDotView, HabitDraft, HabitView, RoutineDraft, RoutineToday, RoutineView,
    RoutinesError, RoutinesView, RunStepView, RunView, StepOutcome, StepState, TemplateId,
    TemplateView,
};
pub use settings::{Settings, Theme, default_selected_id};
pub use timer::{
    ClockTick, Mode, Offer, StartRequest, StoreStatus, SuggestionView, TimerState, TimerTask,
    TimerView,
};
pub use tips::{TipId, TipSeen};
