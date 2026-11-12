//! The native menus: the app menu (Settings…) and the Focus menu after View.

pub(crate) mod app_menu;
pub(crate) mod focus_menu;

/// Which handler owns a menu id.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Route {
    Focus,
    App,
}

/// The Focus menu's ids go to it by prefix; every other id goes to the app menu.
#[cfg_attr(not(any(target_os = "macos", test)), allow(dead_code))]
pub(crate) fn route(id: &str) -> Route {
    if focus_menu::is_focus_id(id) {
        Route::Focus
    } else {
        Route::App
    }
}

/// Handles an app menu event: exactly one handler runs it (`route`).
#[cfg(target_os = "macos")]
pub(crate) fn on_menu_event(app: &tauri::AppHandle, id: &str) {
    match route(id) {
        Route::Focus => focus_menu::on_menu_event(app, id),
        Route::App => app_menu::on_menu_event(app, id),
    }
}

#[cfg(test)]
mod tests {
    use super::{Route, route};

    #[test]
    fn menu_ids_route_to_exactly_one_handler() {
        assert_eq!(route("focus:commands"), Route::Focus);
        assert_eq!(route("focus:full-screen:A"), Route::Focus);
        assert_eq!(route("settings"), Route::App);
        assert_eq!(route("about"), Route::App);
    }
}
