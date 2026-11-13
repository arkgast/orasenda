//! The native menus: the app menu (Settings…), View and Window built from the registry, and the
//! Focus menu after View. Every registry item runs through `actions::run` (ADR-020).
//!
//! The pure models ([`view_menu::entries`] and the others) are tested on every desktop target;
//! the native build and the rebinding of accelerators are macOS only.

pub(crate) mod app_menu;
pub(crate) mod focus_menu;
#[cfg(target_os = "macos")]
mod native;
pub(crate) mod view_menu;
pub(crate) mod window_menu;

use orasenda_service::api::KeyboardView;
use orasenda_service::keyboard::ActionId;

#[cfg(target_os = "macos")]
pub(crate) use native::{apply_accelerators, rebuild_view};

/// One item of a registry-built menu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Item {
    pub(crate) id: &'static str,
    pub(crate) label: &'static str,
    /// The registry action the item runs; `None` for Commands….
    pub(crate) action: Option<ActionId>,
    /// The *In Orasenda* binding (or a fixed key), in the canonical form muda parses.
    pub(crate) accelerator: Option<String>,
}

/// A line of a menu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Entry {
    Item(Item),
    Separator,
}

/// The *In Orasenda* binding of `id`, read from the registry view.
pub(crate) fn app_keys(view: &KeyboardView, id: ActionId) -> Option<String> {
    view.action(id).and_then(|a| a.app.keys.clone())
}

pub(crate) fn items(entries: &[Entry]) -> impl Iterator<Item = &Item> {
    entries.iter().filter_map(|entry| match entry {
        Entry::Item(item) => Some(item),
        Entry::Separator => None,
    })
}

/// Every registry-built item with the accelerator it should carry now: the list `set_accelerator`
/// is called with after a rebinding.
pub(crate) fn accelerators(
    view: &KeyboardView,
    displays: usize,
) -> Vec<(&'static str, Option<String>)> {
    let mut all = Vec::new();
    for entries in [
        view_menu::entries(view, displays),
        window_menu::entries(view),
        focus_menu::entries(view),
    ] {
        all.extend(items(&entries).map(|i| (i.id, i.accelerator.clone())));
    }
    all
}

/// Which handler owns a menu id.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Route {
    Focus,
    View,
    Window,
    App,
}

/// The registry menus' ids go to them by prefix; every other id goes to the app menu.
#[cfg_attr(not(any(target_os = "macos", test)), allow(dead_code))]
pub(crate) fn route(id: &str) -> Route {
    if focus_menu::is_focus_id(id) {
        Route::Focus
    } else if view_menu::is_view_id(id) {
        Route::View
    } else if window_menu::is_window_id(id) {
        Route::Window
    } else {
        Route::App
    }
}

/// The action a registry menu id runs, unless the capture panel is the key window: a key meant
/// for the note must not toggle the timer. The handler acts on `main` or the floater whatever
/// window is key.
#[cfg_attr(not(any(target_os = "macos", test)), allow(dead_code))]
pub(crate) fn action_for(id: &str, capture_is_key: bool) -> Option<ActionId> {
    if capture_is_key {
        return None;
    }
    match route(id) {
        Route::Focus => focus_menu::action_of(id),
        Route::View => view_menu::action_of(id),
        Route::Window => window_menu::action_of(id),
        Route::App => None,
    }
}

/// Handles an app menu event: exactly one handler runs it (`route`).
#[cfg(target_os = "macos")]
pub(crate) fn on_menu_event(app: &tauri::AppHandle, id: &str) {
    use orasenda_service::keyboard::Source;
    match route(id) {
        Route::App => app_menu::on_menu_event(app, id),
        Route::Focus | Route::View | Route::Window => {
            let capture_key = native::capture_is_key(app);
            if let Some(action) = action_for(id, capture_key) {
                crate::actions::run(app, action, Source::Menu);
            } else if id == focus_menu::COMMANDS_ID && !capture_key {
                crate::windows::open_palette(app);
            }
        }
    }
}

#[cfg(test)]
mod tests;
