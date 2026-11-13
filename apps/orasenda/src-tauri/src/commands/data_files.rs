//! Export and import through the file panels. Each command is `async` and runs on the blocking
//! pool, where the panel may wait for the user; the work is in `orasenda_service::data`.

use orasenda_service::api::{DataError, DataErrorKind, ExportOutcome, ImportOutcome};
use orasenda_service::data;
use orasenda_service::keyboard::KeyboardService;
use orasenda_service::scheduler::Host;
use tauri::Manager;

use super::on_blocking;
use crate::file_picker::{DialogPicker, FilePicker};
use crate::runtime::ticker::AppHost;

fn task_failed() -> DataError {
    DataError::new(DataErrorKind::Write, "that did not finish; try again")
}

/// Export on any host and picker.
pub(crate) fn export_with<H: Host>(
    host: &H,
    picker: &dyn FilePicker,
) -> Result<ExportOutcome, DataError> {
    data::run_export(host, |name| picker.save(name))
}

/// Import on any host, picker and keyboard service.
pub(crate) fn import_with<H: Host>(
    host: &H,
    keyboard: &KeyboardService,
    picker: &dyn FilePicker,
) -> Result<ImportOutcome, DataError> {
    data::run_import_file(host, keyboard, || picker.open())
}

/// Saves a copy of the data where the user chooses. Works during a session.
#[tauri::command]
#[specta::specta]
pub async fn data_export(app: tauri::AppHandle) -> Result<ExportOutcome, DataError> {
    on_blocking(move || export_with(&AppHost::new(&app), &DialogPicker(app.clone())))
        .await
        .unwrap_or_else(|| Err(task_failed()))
}

/// Merges a data file the user chooses. `Busy` during a session, before any panel opens.
#[tauri::command]
#[specta::specta]
pub async fn data_import(app: tauri::AppHandle) -> Result<ImportOutcome, DataError> {
    on_blocking(move || {
        let keyboard = app.try_state::<KeyboardService>().ok_or_else(|| {
            DataError::new(DataErrorKind::Unavailable, "Orasenda is still starting")
        })?;
        import_with(&AppHost::new(&app), &keyboard, &DialogPicker(app.clone()))
    })
    .await
    .unwrap_or_else(|| Err(task_failed()))
}
