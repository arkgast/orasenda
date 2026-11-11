//! The API contract for the focus session loop: every type the webview sees. The app crate
//! types them for the webview with tauri-specta (ADR-007); `src/bindings.ts` is generated
//! from these.

mod errors;
mod events;
mod settings;
#[cfg(test)]
mod tests;
mod timer;

pub use errors::{
    NotificationsError, NotificationsErrorKind, SettingsError, SettingsErrorKind,
    TimerCommandError, TimerCommandErrorKind,
};
pub use events::{MilestoneEvent, MilestoneKind, NavigatePage};
pub use settings::{Settings, Theme};
pub use timer::{ClockTick, Mode, StartRequest, StoreStatus, TimerState, TimerView};
