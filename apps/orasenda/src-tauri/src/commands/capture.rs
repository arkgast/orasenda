//! The capture panel's window commands: opening it from the menus and closing it from its pad.
//! Saving a note is `capture_note` in `inbox.rs`.

use super::on_blocking;
use crate::ipc::FocusViewError;
use crate::windows;

/// Opens the capture panel on the display under the pointer, or focuses its text area.
#[tauri::command]
#[specta::specta]
pub async fn capture_open(app: tauri::AppHandle) -> Result<(), FocusViewError> {
    on_blocking(move || windows::open_capture(&app))
        .await
        .unwrap_or_else(|| {
            Err(FocusViewError::unavailable(
                "Orasenda couldn't finish that. Try again.",
            ))
        })
}

/// Closes the capture panel (its pad calls this after a save, or on Esc with nothing typed).
#[tauri::command]
#[specta::specta]
pub async fn capture_close(app: tauri::AppHandle) {
    let closed = on_blocking(move || windows::close_capture(&app)).await;
    if closed.is_none() {
        eprintln!("capture_close: the close task failed");
    }
}
