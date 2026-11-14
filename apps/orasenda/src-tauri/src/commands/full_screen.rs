//! `main`'s native full screen (ADR-019). Not routed from the actions yet (H4b swaps them);
//! the commands are what the palette's display commands and the actions will call.
//!
//! Every call runs on a blocking thread: a transition waits for AppKit's did-enter or
//! did-exit. Failures are returned, never swallowed.

use super::on_blocking;
use crate::ipc::{FullScreenError, WindowView};
use crate::windows;

fn task_failed() -> FullScreenError {
    FullScreenError::unavailable("Orasenda couldn't finish that. Try again.")
}

/// Enters full screen on the display `main` is on.
#[tauri::command]
#[specta::specta]
pub async fn full_screen_enter(app: tauri::AppHandle) -> Result<(), FullScreenError> {
    on_blocking(move || windows::full_screen::enter(&app, None))
        .await
        .unwrap_or_else(|| Err(task_failed()))
}

/// Enters full screen on another display: leaves, waits for did-exit, moves, enters.
#[tauri::command]
#[specta::specta]
pub async fn full_screen_enter_on(
    app: tauri::AppHandle,
    display_id: String,
) -> Result<(), FullScreenError> {
    on_blocking(move || windows::full_screen::enter(&app, Some(&display_id)))
        .await
        .unwrap_or_else(|| Err(task_failed()))
}

/// Leaves full screen at once. Not in full screen is done.
#[tauri::command]
#[specta::specta]
pub async fn full_screen_leave(app: tauri::AppHandle) -> Result<(), FullScreenError> {
    on_blocking(move || windows::full_screen::leave(&app))
        .await
        .unwrap_or_else(|| Err(task_failed()))
}

/// `main`'s full-screen state, display and the hints left, for a webview that just mounted or
/// reloaded. The same value the last `window-view` event carried.
#[tauri::command]
#[specta::specta]
pub async fn window_view(app: tauri::AppHandle) -> WindowView {
    on_blocking(move || windows::full_screen::view(&app))
        .await
        .unwrap_or(WindowView {
            full_screen: false,
            display: None,
            hints_left: 0,
        })
}
