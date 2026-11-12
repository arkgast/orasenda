//! The native menus: the app menu (Settings…) and the Focus menu after View.

pub(crate) mod app_menu;
pub(crate) mod focus_menu;

/// Handles an app menu event: the Focus menu's ids by prefix, the rest to the app menu. Each
/// handler ignores ids it does not own, so one event runs one handler.
#[cfg(target_os = "macos")]
pub(crate) fn on_menu_event(app: &tauri::AppHandle, id: &str) {
    if focus_menu::is_focus_id(id) {
        focus_menu::on_menu_event(app, id);
    } else {
        app_menu::on_menu_event(app, id);
    }
}
