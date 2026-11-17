//! The weekly review's commands. `main`-window only. Each one runs the service on the
//! blocking pool; a panicked task answers `Store`.

use orasenda_service::review;

use crate::commands::on_blocking;
use crate::ipc::{ReviewError, WeeklyDraft, WeeklyView};
use crate::runtime::ticker::AppHost;

/// The weekly review: the look-back on the week before the planned one, what is answered so
/// far, and last week's improvement.
#[tauri::command]
#[specta::specta]
pub async fn weekly_get(app: tauri::AppHandle) -> Result<WeeklyView, ReviewError> {
    on_blocking(move || review::run_weekly_get(&AppHost::new(&app)))
        .await
        .unwrap_or(Err(ReviewError::Store))
}

/// Saves the weekly draft for the week starting `week_start` and returns the view with every
/// typed priority resolved to its task. Answers `Period` for a week older than the one before.
#[tauri::command]
#[specta::specta]
pub async fn weekly_save(
    app: tauri::AppHandle,
    week_start: String,
    draft: WeeklyDraft,
) -> Result<WeeklyView, ReviewError> {
    on_blocking(move || review::run_weekly_save(&AppHost::new(&app), week_start, draft))
        .await
        .unwrap_or(Err(ReviewError::Store))
}

/// Saves the draft and marks the week planned. The first completion time is kept.
#[tauri::command]
#[specta::specta]
pub async fn weekly_complete(
    app: tauri::AppHandle,
    week_start: String,
    draft: WeeklyDraft,
) -> Result<WeeklyView, ReviewError> {
    on_blocking(move || review::run_weekly_complete(&AppHost::new(&app), week_start, draft))
        .await
        .unwrap_or(Err(ReviewError::Store))
}
