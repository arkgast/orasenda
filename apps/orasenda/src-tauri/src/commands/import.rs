//! The task-import commands: thin wrappers over `orasenda_service::import`. The Todoist panel
//! is the only thing added here; everything the user reads is made in the service.

use orasenda_service::api::{
    ImportDone, ImportError, ImportErrorKind, ImportPreview, ImportSourceKind, ImportSourceView,
    ImportSourcesView, PreviewRequest,
};
use orasenda_service::import::{
    run_import_discard, run_import_open_settings, run_import_preview, run_import_sources,
    run_task_import, run_task_import_undo,
};
use orasenda_service::scheduler::Host;
use serde::{Deserialize, Serialize};

use super::on_blocking;
use crate::file_picker::{DialogPicker, FilePicker};
use crate::runtime::ticker::AppHost;

/// What `import_preview` did: the preview, or nothing when the Open panel was cancelled.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ImportPreviewOutcome {
    Picked(ImportPreview),
    Cancelled {},
}

/// A preview or import id as the webview sends it back: a plain number, lossless below 2^53
/// (specta forbids `u64` in a command argument, so the id is wrapped).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, specta::Type)]
#[serde(transparent)]
pub struct ImportRef(#[specta(type = specta_typescript::Number)] pub u64);

const TASK_FAILED: &str = "That didn't finish. Try again.";
const WRITE_FAILED: &str = "The tasks weren't imported. Try again.";
const PANEL_FAILED: &str = "Orasenda couldn't open that file.";

fn task_failed() -> ImportError {
    ImportError::store(TASK_FAILED)
}

/// `import_preview` on any host and picker. Todoist shows the Open panel first; a cancel is
/// not an error, and a panel failure is `unreadable`.
pub(crate) fn import_preview_with<H: Host>(
    host: &H,
    picker: &dyn FilePicker,
    source: ImportSourceKind,
) -> Result<ImportPreviewOutcome, ImportError> {
    let request = match source {
        ImportSourceKind::Reminders => PreviewRequest::Reminders,
        ImportSourceKind::Things => PreviewRequest::Things,
        ImportSourceKind::Todoist => match picker.open_import() {
            Ok(Some(path)) => PreviewRequest::Todoist(path),
            Ok(None) => return Ok(ImportPreviewOutcome::Cancelled {}),
            Err(error) => {
                eprintln!("import: the file panel failed ({error:?})");
                return Err(ImportError::new(ImportErrorKind::Unreadable, PANEL_FAILED));
            }
        },
    };
    run_import_preview(host, request).map(ImportPreviewOutcome::Picked)
}

/// The sources the picker lists, and why one can't be chosen now.
#[tauri::command]
#[specta::specta]
pub async fn import_sources(app: tauri::AppHandle) -> ImportSourcesView {
    on_blocking(move || run_import_sources(&AppHost::new(&app)))
        .await
        .unwrap_or_else(|| ImportSourcesView {
            // Could not look: offer the one source that needs nothing from the system.
            sources: vec![ImportSourceView {
                kind: ImportSourceKind::Todoist,
                available: true,
                reason: None,
            }],
        })
}

/// Reads a source and keeps the result as the one pending preview. Writes nothing. Todoist
/// shows the Open panel first.
#[tauri::command]
#[specta::specta]
pub async fn import_preview(
    app: tauri::AppHandle,
    source: ImportSourceKind,
) -> Result<ImportPreviewOutcome, ImportError> {
    on_blocking(move || {
        import_preview_with(&AppHost::new(&app), &DialogPicker(app.clone()), source)
    })
    .await
    .unwrap_or_else(|| Err(task_failed()))
}

/// Drops the pending preview when it is `preview_id`.
#[tauri::command]
#[specta::specta]
pub async fn import_discard(app: tauri::AppHandle, preview_id: ImportRef) {
    let _ = on_blocking(move || run_import_discard(&AppHost::new(&app), preview_id.0)).await;
}

/// Adds the chosen rows of the pending preview to the Backlog.
#[tauri::command]
#[specta::specta]
pub async fn task_import(
    app: tauri::AppHandle,
    preview_id: ImportRef,
    keys: Vec<u32>,
) -> Result<ImportDone, ImportError> {
    on_blocking(move || run_task_import(&AppHost::new(&app), preview_id.0, keys))
        .await
        .unwrap_or_else(|| Err(ImportError::store(WRITE_FAILED)))
}

/// Removes the tasks of the last import that are still on the Board; answers how many.
#[tauri::command]
#[specta::specta]
pub async fn task_import_undo(
    app: tauri::AppHandle,
    import_id: ImportRef,
) -> Result<u32, ImportError> {
    on_blocking(move || run_task_import_undo(&AppHost::new(&app), import_id.0))
        .await
        .unwrap_or_else(|| Err(task_failed()))
}

/// Opens the System Settings pane for a source's permission, on the main thread.
#[tauri::command]
#[specta::specta]
pub async fn import_open_settings(
    app: tauri::AppHandle,
    source: ImportSourceKind,
) -> Result<(), ImportError> {
    let (tx, mut rx) = tauri::async_runtime::channel(1);
    let host = AppHost::new(&app);
    app.run_on_main_thread(move || {
        let _ = tx.try_send(run_import_open_settings(&host, source));
    })
    .map_err(|_| task_failed())?;
    rx.recv().await.unwrap_or_else(|| Err(task_failed()))
}
