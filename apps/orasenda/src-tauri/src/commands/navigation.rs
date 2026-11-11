//! The navigation command.

use tauri::Manager;

use crate::ipc::NavigatePage;
use crate::lifecycle;

// Sync: it only swaps a small mutex.
/// The page the app was asked to show before the webview listened, once.
#[tauri::command]
#[specta::specta]
pub fn navigate_take(app: tauri::AppHandle) -> Option<NavigatePage> {
    app.try_state::<lifecycle::PendingNavigate>()
        .and_then(|pending| pending.take())
}
