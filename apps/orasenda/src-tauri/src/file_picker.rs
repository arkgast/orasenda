//! The file panels behind a trait, so tests run without one. Only Rust opens a panel: no
//! webview holds a `dialog:` or `fs:` permission (spec 2026-11-12, sub-project G).

use std::path::PathBuf;

use orasenda_service::api::DataError;

/// A Save or Open panel. Both block until the user answers, so call them on the blocking pool.
/// `Ok(None)` means the user cancelled.
pub trait FilePicker: Send + Sync {
    /// A Save panel offering `default_name`, `.db` files only.
    fn save(&self, default_name: &str) -> Result<Option<PathBuf>, DataError>;
    /// An Open panel for one `.db` file.
    fn open(&self) -> Result<Option<PathBuf>, DataError>;
}

/// The panels of the dialog plugin (desktop).
#[cfg(desktop)]
pub struct DialogPicker(pub tauri::AppHandle);

#[cfg(desktop)]
impl DialogPicker {
    /// Takes the answer the plugin's callback sends on a one-slot channel.
    fn answer(
        receiver: &mut tauri::async_runtime::Receiver<Option<tauri_plugin_dialog::FilePath>>,
    ) -> Result<Option<PathBuf>, DataError> {
        use orasenda_service::api::DataErrorKind;
        let picked = receiver.blocking_recv().ok_or_else(|| {
            DataError::new(DataErrorKind::Unavailable, "the file panel did not answer")
        })?;
        picked
            .map(|path| {
                path.into_path().map_err(|error| {
                    eprintln!("data: the panel gave a path that is not a file ({error})");
                    DataError::new(DataErrorKind::Unreadable, "that is not a file on this Mac")
                })
            })
            .transpose()
    }
}

#[cfg(desktop)]
impl FilePicker for DialogPicker {
    fn save(&self, default_name: &str) -> Result<Option<PathBuf>, DataError> {
        use tauri_plugin_dialog::DialogExt;
        let (tx, mut rx) = tauri::async_runtime::channel(1);
        self.0
            .dialog()
            .file()
            .set_file_name(default_name)
            .add_filter("Orasenda data", &["db"])
            .save_file(move |path| {
                let _ = tx.try_send(path);
            });
        Self::answer(&mut rx)
    }

    fn open(&self) -> Result<Option<PathBuf>, DataError> {
        use tauri_plugin_dialog::DialogExt;
        let (tx, mut rx) = tauri::async_runtime::channel(1);
        self.0
            .dialog()
            .file()
            .add_filter("Orasenda data", &["db"])
            .pick_file(move |path| {
                let _ = tx.try_send(path);
            });
        Self::answer(&mut rx)
    }
}

/// Mobile has no panel yet; it says so instead of pretending to cancel.
#[cfg(not(desktop))]
pub struct DialogPicker(
    #[allow(dead_code, reason = "kept so both targets build the same call")] pub tauri::AppHandle,
);

#[cfg(not(desktop))]
impl FilePicker for DialogPicker {
    fn save(&self, _default_name: &str) -> Result<Option<PathBuf>, DataError> {
        Err(unavailable())
    }

    fn open(&self) -> Result<Option<PathBuf>, DataError> {
        Err(unavailable())
    }
}

#[cfg(not(desktop))]
fn unavailable() -> DataError {
    DataError::new(
        orasenda_service::api::DataErrorKind::Unavailable,
        "file panels are not available here yet",
    )
}
