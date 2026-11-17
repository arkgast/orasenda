//! The shutdown commands. `main`-window only. Each one runs the service on the blocking pool;
//! a panicked task answers `Store`.

use orasenda_service::review;

use crate::commands::on_blocking;
use crate::ipc::{MoveUndo, ReviewError, ShutdownAnswers, ShutdownView};
use crate::runtime::ticker::AppHost;

/// The guided shutdown for the current shutdown day.
#[tauri::command]
#[specta::specta]
pub async fn shutdown_get(app: tauri::AppHandle) -> Result<ShutdownView, ReviewError> {
    on_blocking(move || review::run_shutdown_get(&AppHost::new(&app)))
        .await
        .unwrap_or(Err(ReviewError::Store))
}

/// Sends the chosen unfinished tasks to the end of the Backlog in one write. A task with a
/// running session stays. The token undoes it for 10 minutes.
#[tauri::command]
#[specta::specta]
pub async fn shutdown_move(
    app: tauri::AppHandle,
    ids: Vec<String>,
) -> Result<MoveUndo, ReviewError> {
    on_blocking(move || review::run_shutdown_move(&AppHost::new(&app), ids))
        .await
        .unwrap_or(Err(ReviewError::Store))
}

/// Puts the last move back. Answers the line to show; `NotFound` once the token has expired or
/// been replaced.
#[tauri::command]
#[specta::specta]
pub async fn shutdown_move_undo(
    app: tauri::AppHandle,
    token: String,
) -> Result<String, ReviewError> {
    on_blocking(move || review::run_shutdown_move_undo(&AppHost::new(&app), &token))
        .await
        .unwrap_or(Err(ReviewError::Store))
}

/// Saves the answers for `day` and completes the shutdown.
#[tauri::command]
#[specta::specta]
pub async fn shutdown_complete(
    app: tauri::AppHandle,
    day: String,
    answers: ShutdownAnswers,
) -> Result<ShutdownView, ReviewError> {
    on_blocking(move || review::run_shutdown_complete(&AppHost::new(&app), &day, answers))
        .await
        .unwrap_or(Err(ReviewError::Store))
}
