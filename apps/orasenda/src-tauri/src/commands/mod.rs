//! Tauri commands. Each one is listed in `commands.list.rs` and granted in a capability.

use orasenda_core::AppInfo;
use tauri::PackageInfo;

mod focus_views;
mod hint;
mod inbox;
mod keyboard;
mod menu_popup;
mod navigation;
mod notifications;
mod presets;
mod settings;
mod timer;
mod tips;

pub use focus_views::*;
#[cfg(test)]
pub(crate) use focus_views::{closable, display_infos};
pub use hint::*;
pub use inbox::*;
pub use keyboard::*;
pub use menu_popup::*;
pub use navigation::*;
pub use notifications::*;
pub use presets::*;
pub use settings::*;
pub use timer::*;
pub use tips::*;

/// Name, version and platform of the running app.
#[tauri::command]
#[specta::specta]
pub fn app_info(app: tauri::AppHandle) -> AppInfo {
    app_info_from(app.package_info())
}

/// Runs `work` on the blocking pool, so no lock, SQLite write or notifier read runs on the
/// async runtime or the main thread. `None` when the task panicked (logged).
pub(crate) async fn on_blocking<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
) -> Option<T> {
    match tauri::async_runtime::spawn_blocking(work).await {
        Ok(value) => Some(value),
        Err(error) => {
            eprintln!("commands: a session task failed: {error}");
            None
        }
    }
}

/// Name and version come from the app's package info, never from core's own Cargo metadata.
fn app_info_from(package: &PackageInfo) -> AppInfo {
    AppInfo::new(package.name.as_str(), package.version.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_uses_package_info_not_core_version() {
        let package = PackageInfo {
            name: "Orasenda".into(),
            version: "9.8.7".parse().unwrap(),
            authors: "",
            description: "",
            crate_name: "orasenda",
        };
        let info = app_info_from(&package);
        assert_eq!(info.name, "Orasenda");
        assert_eq!(info.version, "9.8.7");
        assert_eq!(info, AppInfo::new("Orasenda", "9.8.7"));
    }
}
