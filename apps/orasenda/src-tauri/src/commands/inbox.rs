//! The Inbox commands. `capture_note` is for the capture panel (granted to `main` until F6
//! moves it); the rest are Board's.

use orasenda_service::inbox;

use super::on_blocking;
use crate::ipc::{CaptureError, InboxError, NewCapture, NoteView};
use crate::runtime::ticker::AppHost;

/// Saves a note to the Inbox; answers it.
#[tauri::command]
#[specta::specta]
pub async fn capture_note(
    app: tauri::AppHandle,
    note: NewCapture,
) -> Result<NoteView, CaptureError> {
    on_blocking(move || inbox::run_capture_note(&AppHost::new(&app), note))
        .await
        .unwrap_or(Err(CaptureError::Store))
}

/// The live notes, newest first.
#[tauri::command]
#[specta::specta]
pub async fn inbox_list(app: tauri::AppHandle) -> Result<Vec<NoteView>, InboxError> {
    on_blocking(move || inbox::run_inbox_list(&AppHost::new(&app)))
        .await
        .unwrap_or(Err(InboxError::Store))
}

/// Removes a note (it can be brought back).
#[tauri::command]
#[specta::specta]
pub async fn inbox_remove(app: tauri::AppHandle, id: String) -> Result<(), InboxError> {
    on_blocking(move || inbox::run_inbox_remove(&AppHost::new(&app), &id))
        .await
        .unwrap_or(Err(InboxError::Store))
}

/// Brings a removed note back.
#[tauri::command]
#[specta::specta]
pub async fn inbox_restore(app: tauri::AppHandle, id: String) -> Result<(), InboxError> {
    on_blocking(move || inbox::run_inbox_restore(&AppHost::new(&app), &id))
        .await
        .unwrap_or(Err(InboxError::Store))
}
