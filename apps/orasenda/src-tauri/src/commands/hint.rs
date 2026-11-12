//! The one-time hints.

use super::on_blocking;
use crate::ipc::{Hint, TimerCommandError, TimerCommandErrorKind, TimerView};
use crate::runtime::session::{self, Action};

/// Today showed `hint`: remember it for good and return the view without it.
#[tauri::command]
#[specta::specta]
pub async fn hint_shown(app: tauri::AppHandle, hint: Hint) -> Result<TimerView, TimerCommandError> {
    on_blocking(move || session::run_action(&app, Action::HintShown(hint)))
        .await
        .unwrap_or_else(|| {
            Err(TimerCommandError {
                kind: TimerCommandErrorKind::Store,
                message: "Orasenda couldn't finish that. Try again.".into(),
            })
        })
}
