//! The Review overview command. `main`-window only; it runs the service on the blocking pool,
//! and a panicked task answers `Store`.

use orasenda_service::review;

use crate::commands::on_blocking;
use crate::ipc::{ReviewError, ReviewView};
use crate::runtime::ticker::AppHost;

/// Today's shutdown, the planned week, and which one leads.
#[tauri::command]
#[specta::specta]
pub async fn review_get(app: tauri::AppHandle) -> Result<ReviewView, ReviewError> {
    on_blocking(move || review::run_review_get(&AppHost::new(&app)))
        .await
        .unwrap_or(Err(ReviewError::Store))
}
