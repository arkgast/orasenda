//! The Board's commands (spec 2026-11-14, §Service and IPC). `main`-window only. Each one runs
//! the service on the blocking pool; a panicked task answers `Store`.

use orasenda_service::board;

use super::on_blocking;
use crate::ipc::{BoardError, BoardView, Lane, TaskDraft, TaskPatchView, TaskView};
use crate::runtime::ticker::AppHost;

/// Runs `work` with the app's host on the blocking pool.
async fn run<T: Send + 'static>(
    app: tauri::AppHandle,
    work: impl FnOnce(&AppHost) -> Result<T, BoardError> + Send + 'static,
) -> Result<T, BoardError> {
    on_blocking(move || work(&AppHost::new(&app)))
        .await
        .unwrap_or(Err(BoardError::Store))
}

/// The whole board.
#[tauri::command]
#[specta::specta]
pub async fn board_get(app: tauri::AppHandle) -> Result<BoardView, BoardError> {
    run(app, board::run_board_get).await
}

/// Adds a task at the end of its column (Backlog unless said).
#[tauri::command]
#[specta::specta]
pub async fn task_add(app: tauri::AppHandle, draft: TaskDraft) -> Result<TaskView, BoardError> {
    run(app, move |host| board::run_task_add(host, draft)).await
}

/// Saves the fields of a patch.
#[tauri::command]
#[specta::specta]
pub async fn task_update(
    app: tauri::AppHandle,
    id: String,
    patch: TaskPatchView,
) -> Result<(), BoardError> {
    run(app, move |host| board::run_task_update(host, &id, &patch)).await
}

/// Moves a task to a column at an index (past the end means last).
#[tauri::command]
#[specta::specta]
pub async fn task_move(
    app: tauri::AppHandle,
    id: String,
    lane: Lane,
    index: u32,
) -> Result<(), BoardError> {
    run(app, move |host| {
        board::run_task_move(host, &id, lane, index)
    })
    .await
}

/// Sets or clears today's Frog; answers the Frog it replaced.
#[tauri::command]
#[specta::specta]
pub async fn task_set_frog(
    app: tauri::AppHandle,
    id: String,
    on: bool,
) -> Result<Option<String>, BoardError> {
    run(app, move |host| board::run_task_set_frog(host, &id, on)).await
}

/// Removes a task (it can be brought back).
#[tauri::command]
#[specta::specta]
pub async fn task_remove(app: tauri::AppHandle, id: String) -> Result<(), BoardError> {
    run(app, move |host| board::run_task_remove(host, &id)).await
}

/// Brings a removed task back.
#[tauri::command]
#[specta::specta]
pub async fn task_restore(app: tauri::AppHandle, id: String) -> Result<(), BoardError> {
    run(app, move |host| board::run_task_restore(host, &id)).await
}

/// Moves an Inbox note to the Backlog as a task.
#[tauri::command]
#[specta::specta]
pub async fn inbox_to_task(app: tauri::AppHandle, note_id: String) -> Result<TaskView, BoardError> {
    run(app, move |host| board::run_inbox_to_task(host, &note_id)).await
}

/// Undoes a move from the Inbox: the task goes, the note comes back.
#[tauri::command]
#[specta::specta]
pub async fn task_restore_note(app: tauri::AppHandle, task_id: String) -> Result<(), BoardError> {
    run(app, move |host| {
        board::run_task_restore_note(host, &task_id)
    })
    .await
}

/// Saves a column's name and limit.
#[tauri::command]
#[specta::specta]
pub async fn board_column_edit(
    app: tauri::AppHandle,
    lane: Lane,
    name: String,
    limit: Option<u8>,
) -> Result<(), BoardError> {
    run(app, move |host| {
        board::run_board_column_edit(host, lane, name, limit)
    })
    .await
}

/// Adds a custom column right after `after`; answers its id.
#[tauri::command]
#[specta::specta]
pub async fn board_column_add(app: tauri::AppHandle, after: Lane) -> Result<Lane, BoardError> {
    run(app, move |host| board::run_board_column_add(host, after)).await
}

/// Removes an empty custom column.
#[tauri::command]
#[specta::specta]
pub async fn board_column_remove(app: tauri::AppHandle, lane: Lane) -> Result<(), BoardError> {
    run(app, move |host| board::run_board_column_remove(host, lane)).await
}

/// Saves whether a column is folded.
#[tauri::command]
#[specta::specta]
pub async fn board_column_fold(
    app: tauri::AppHandle,
    lane: Lane,
    folded: bool,
) -> Result<(), BoardError> {
    run(app, move |host| {
        board::run_board_column_fold(host, lane, folded)
    })
    .await
}
