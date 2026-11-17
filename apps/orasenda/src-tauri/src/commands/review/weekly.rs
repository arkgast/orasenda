//! The weekly review's commands. `main`-window only. Each one runs the service on the
//! blocking pool; a panicked task answers `Store`.

use orasenda_service::review;

use crate::commands::on_blocking;
use crate::ipc::{ReviewError, WeeklyView};
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
