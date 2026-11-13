//! The API contract for the focus session loop: every type the webview sees. The app crate
//! types them for the webview with tauri-specta (ADR-007); `src/ipc/bindings.ts` is generated
//! from these.

mod errors;
mod events;
mod hint;
mod inbox;
mod keyboard;
mod presets;
mod settings;
#[cfg(test)]
mod tests;
mod timer;

pub use errors::{
    NotificationsError, NotificationsErrorKind, SettingsError, SettingsErrorKind,
    TimerCommandError, TimerCommandErrorKind,
};
pub use events::{MilestoneEvent, MilestoneKind, NavigatePage};
pub use hint::Hint;
pub use inbox::{CaptureError, InboxError, NewCapture, NoteKind, NoteView};
pub use keyboard::{KeyboardError, KeyboardView, ShortcutId, ShortcutStatus, ShortcutView};
pub use presets::{PresetEntry, PresetError, PresetErrorKind, PresetPatch, entries};
pub use settings::{Settings, Theme, default_selected_id};
pub use timer::{
    ClockTick, Mode, Offer, StartRequest, StoreStatus, SuggestionView, TimerState, TimerView,
};
