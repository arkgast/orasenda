//! The one-time tips.

use super::on_blocking;
use crate::ipc::{TimerCommandError, TimerCommandErrorKind, TimerView, TipId, TipSeen};
use crate::runtime::session::{self, Action};

/// Today showed `tip`, or the person pressed Got it: remember it and return the view.
#[tauri::command]
#[specta::specta]
pub async fn tip_seen(
    app: tauri::AppHandle,
    tip: TipId,
    how: TipSeen,
) -> Result<TimerView, TimerCommandError> {
    on_blocking(move || session::run_action(&app, Action::TipSeen(tip, how)))
        .await
        .unwrap_or_else(|| {
            Err(TimerCommandError {
                kind: TimerCommandErrorKind::Store,
                message: "Orasenda couldn't finish that. Try again.".into(),
            })
        })
}
