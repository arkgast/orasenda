//! The data commands: overview, backups, Restore and Delete all data. Each one is `async` and
//! runs on the blocking pool; the work is in `orasenda_service::data`.

use orasenda_service::api::{BackupEntry, BackupPolicy, DataError, DataErrorKind, DataOverview};
use orasenda_service::data;

use super::on_blocking;
use crate::runtime::ticker::AppHost;

fn task_failed() -> DataError {
    DataError::new(DataErrorKind::Write, "that did not finish; try again")
}

/// Counts, folder, backups, policy and their size.
#[tauri::command]
#[specta::specta]
pub async fn data_overview(app: tauri::AppHandle) -> DataOverview {
    on_blocking(move || data::run_overview(&AppHost::new(&app)))
        .await
        .unwrap_or_else(DataOverview::unavailable)
}

/// Shows `orasenda.db` in Finder.
#[tauri::command]
#[specta::specta]
pub async fn data_show_folder(app: tauri::AppHandle) -> Result<(), DataError> {
    on_blocking(move || {
        use orasenda_service::scheduler::Host;
        let dir = AppHost::new(&app).data_dir().ok_or_else(|| {
            DataError::new(
                DataErrorKind::Unavailable,
                "Orasenda can't find its data folder",
            )
        })?;
        let db = dir.join("orasenda.db");
        let target = if db.exists() { db } else { dir };
        crate::platform::reveal(&target).map_err(|error| {
            eprintln!("data: could not show the folder ({error})");
            DataError::new(
                DataErrorKind::Unavailable,
                "Finder could not show the folder",
            )
        })
    })
    .await
    .unwrap_or_else(|| Err(task_failed()))
}

/// Stages a fresh start and restarts. `Busy` during a session.
#[tauri::command]
#[specta::specta]
pub async fn data_delete_all(app: tauri::AppHandle) -> Result<(), DataError> {
    on_blocking(move || data::run_data_delete_all(&AppHost::new(&app)))
        .await
        .unwrap_or_else(|| Err(task_failed()))
}

/// A `manual` backup of the current data.
#[tauri::command]
#[specta::specta]
pub async fn backups_create(app: tauri::AppHandle) -> Result<BackupEntry, DataError> {
    on_blocking(move || data::run_backups_create(&AppHost::new(&app)))
        .await
        .unwrap_or_else(|| Err(task_failed()))
}

/// Deletes one backup file.
#[tauri::command]
#[specta::specta]
pub async fn backups_delete(app: tauri::AppHandle, file: String) -> Result<(), DataError> {
    on_blocking(move || data::run_backups_delete(&AppHost::new(&app), &file))
        .await
        .unwrap_or_else(|| Err(task_failed()))
}

/// Stages a backup, backs up the current data and restarts. `Busy` during a session, `Newer`
/// for a backup from a newer Orasenda.
#[tauri::command]
#[specta::specta]
pub async fn backups_restore(app: tauri::AppHandle, file: String) -> Result<(), DataError> {
    on_blocking(move || data::run_backups_restore(&AppHost::new(&app), &file))
        .await
        .unwrap_or_else(|| Err(task_failed()))
}

/// Saves the backup policy and prunes to its `keep` at once.
#[tauri::command]
#[specta::specta]
pub async fn backups_set_policy(
    app: tauri::AppHandle,
    policy: BackupPolicy,
) -> Result<BackupPolicy, DataError> {
    on_blocking(move || data::run_backups_set_policy(&AppHost::new(&app), &policy))
        .await
        .unwrap_or_else(|| Err(task_failed()))
}
