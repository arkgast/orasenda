//! The Review page's stats commands. `main`-window only. Each one runs the service on the
//! blocking pool; a panicked task answers `Store`.

use orasenda_service::review;

use crate::commands::on_blocking;
use crate::ipc::{ReviewError, StatsRange, StatsView};
use crate::runtime::ticker::AppHost;

/// The neutral stats for a range: focus, goal, tasks, routines, habits and the buffer
/// suggestion.
#[tauri::command]
#[specta::specta]
pub async fn review_stats(
    app: tauri::AppHandle,
    range: StatsRange,
) -> Result<StatsView, ReviewError> {
    on_blocking(move || review::run_review_stats(&AppHost::new(&app), range))
        .await
        .unwrap_or(Err(ReviewError::Store))
}

/// *Not now* on the buffer suggestion: hides it for 28 days on this device. Never changes the
/// buffer.
#[tauri::command]
#[specta::specta]
pub async fn buffer_suggestion_dismiss(app: tauri::AppHandle) -> Result<(), ReviewError> {
    on_blocking(move || review::run_buffer_suggestion_dismiss(&AppHost::new(&app)))
        .await
        .unwrap_or(Err(ReviewError::Store))
}
