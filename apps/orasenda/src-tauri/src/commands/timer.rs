//! The timer commands.

use orasenda_core::NotificationStatus;

use super::on_blocking;
use crate::ipc::{
    StartRequest, StoreStatus, TimerCommandError, TimerCommandErrorKind, TimerState, TimerView,
};
use crate::runtime::session::{self, Action};

/// What a timer command returns when its task panicked: a failure, never a success.
fn task_failed() -> TimerCommandError {
    TimerCommandError {
        kind: TimerCommandErrorKind::Store,
        message: "Orasenda couldn't finish that. Try again.".into(),
    }
}

async fn run(app: tauri::AppHandle, action: Action) -> Result<TimerView, TimerCommandError> {
    on_blocking(move || session::run_action(&app, action))
        .await
        .unwrap_or_else(|| Err(task_failed()))
}

/// The current timer view and any milestones not yet seen.
#[tauri::command]
#[specta::specta]
pub async fn timer_state(app: tauri::AppHandle) -> TimerState {
    on_blocking(move || session::run_state(&app))
        .await
        .unwrap_or_else(|| TimerState {
            view: TimerView::idle(StoreStatus::Unavailable, NotificationStatus::Unavailable),
            pending: Vec::new(),
        })
}

/// Starts a session.
#[tauri::command]
#[specta::specta]
pub async fn timer_start(
    app: tauri::AppHandle,
    request: StartRequest,
) -> Result<TimerView, TimerCommandError> {
    run(app, Action::Start(request)).await
}

/// Pauses the running session.
#[tauri::command]
#[specta::specta]
pub async fn timer_pause(app: tauri::AppHandle) -> Result<TimerView, TimerCommandError> {
    run(app, Action::Pause).await
}

/// Resumes a paused session.
#[tauri::command]
#[specta::specta]
pub async fn timer_resume(app: tauri::AppHandle) -> Result<TimerView, TimerCommandError> {
    run(app, Action::Resume).await
}

/// Stops the session.
#[tauri::command]
#[specta::specta]
pub async fn timer_stop(app: tauri::AppHandle) -> Result<TimerView, TimerCommandError> {
    run(app, Action::Stop).await
}

/// Adds ten minutes to the session: from the last two minutes of a focus, or from a break.
#[tauri::command]
#[specta::specta]
pub async fn timer_extend(app: tauri::AppHandle) -> Result<TimerView, TimerCommandError> {
    run(app, Action::Extend).await
}

/// Clears the "Keep going?" offer. Safe to call twice.
#[tauri::command]
#[specta::specta]
pub async fn timer_dismiss_offer(app: tauri::AppHandle) -> Result<TimerView, TimerCommandError> {
    run(app, Action::DismissOffer).await
}

/// Ends the focus now as completed and starts its break.
#[tauri::command]
#[specta::specta]
pub async fn timer_take_break(app: tauri::AppHandle) -> Result<TimerView, TimerCommandError> {
    run(app, Action::TakeBreak).await
}
