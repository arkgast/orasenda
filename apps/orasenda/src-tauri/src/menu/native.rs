//! The macOS build of the registry menus and the rebinding of their accelerators.

use orasenda_service::api::KeyboardView;
use tauri::menu::{IsMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, Wry};

use super::{Entry, accelerators, focus_menu, view_menu, window_menu};

const VIEW_TEXT: &str = "View";
const WINDOW_TEXT: &str = "Window";

fn missing(what: &str) -> tauri::Error {
    tauri::Error::Io(std::io::Error::other(format!("menu: {what}")))
}

fn append_entries(
    app: &AppHandle,
    entries: &[Entry],
    append: &mut dyn FnMut(&dyn IsMenuItem<Wry>) -> tauri::Result<()>,
) -> tauri::Result<()> {
    for entry in entries {
        match entry {
            Entry::Item(item) => append(&MenuItem::with_id(
                app,
                item.id,
                item.label,
                // Leave Full Screen starts disabled; `set_leave_enabled` follows `window-view`.
                item.id != view_menu::LEAVE_FULL_SCREEN_ID,
                item.accelerator.as_deref(),
            )?)?,
            Entry::Separator => append(&PredefinedMenuItem::separator(app)?)?,
        }
    }
    Ok(())
}

fn submenu_at(menu: &Menu<Wry>, text: &str) -> tauri::Result<(usize, Submenu<Wry>)> {
    for (at, kind) in menu.items()?.into_iter().enumerate() {
        if let MenuItemKind::Submenu(submenu) = kind
            && submenu.text().is_ok_and(|t| t == text)
        {
            return Ok((at, submenu));
        }
    }
    Err(missing(&format!("the default menu has no {text} submenu")))
}

/// Puts View, Window's Floating Timer and Focus into the default menu: our View replaces
/// Tauri's (whose Enter Full Screen is the one item it had), and Focus follows it.
pub(crate) fn install(app: &AppHandle, menu: &Menu<Wry>, view: &KeyboardView) -> tauri::Result<()> {
    // The displays are read after launch (`windows::surfaces_changed`), off the main thread.
    let (at, _) = submenu_at(menu, VIEW_TEXT)?;
    menu.remove_at(at)?;
    let view_menu = Submenu::with_id(app, view_menu::VIEW_MENU_ID, VIEW_TEXT, true)?;
    append_entries(app, &view_menu::entries(view, 1), &mut |c| {
        view_menu.append(c)
    })?;
    menu.insert(&view_menu, at)?;
    let focus = Submenu::with_id(app, focus_menu::FOCUS_MENU_ID, "Focus", true)?;
    append_entries(app, &focus_menu::entries(view), &mut |c| focus.append(c))?;
    menu.insert(&focus, at + 1)?;
    let (_, window) = submenu_at(menu, WINDOW_TEXT)?;
    append_entries(app, &window_menu::entries(view), &mut |c| window.append(c))
}

/// Rebuilds the View items for `displays` displays. Main thread only.
pub(crate) fn rebuild_view(
    app: &AppHandle,
    view: &KeyboardView,
    displays: usize,
) -> tauri::Result<()> {
    let menu = app.menu().ok_or_else(|| missing("the app has no menu"))?;
    let Some(MenuItemKind::Submenu(submenu)) = menu.get(view_menu::VIEW_MENU_ID) else {
        return Err(missing("the app menu has no View submenu"));
    };
    for existing in submenu.items()? {
        submenu.remove(&existing)?;
    }
    append_entries(app, &view_menu::entries(view, displays), &mut |c| {
        submenu.append(c)
    })?;
    // The rebuilt item starts disabled: bring it back in line with the window.
    set_leave_item(&menu, crate::windows::full_screen::is_on(app));
    Ok(())
}

fn set_leave_item(menu: &Menu<Wry>, enabled: bool) {
    if let Some(MenuItemKind::MenuItem(item)) = find_item(menu, view_menu::LEAVE_FULL_SCREEN_ID)
        && let Err(error) = item.set_enabled(enabled)
    {
        eprintln!("menu: could not update Leave Full Screen: {error}");
    }
}

/// Enables Leave Full Screen only while `main` is in full screen. Queued on the main thread.
pub(crate) fn set_leave_enabled(app: &AppHandle, enabled: bool) {
    let handle = app.clone();
    let queued = app.run_on_main_thread(move || {
        if let Some(menu) = handle.menu() {
            set_leave_item(&menu, enabled);
        }
    });
    if let Err(error) = queued {
        eprintln!("menu: could not reach the main thread: {error}");
    }
}

/// `Menu::get` only searches the top level; every registry item sits in a submenu.
fn find_item(menu: &Menu<Wry>, id: &str) -> Option<MenuItemKind<Wry>> {
    menu.items().ok()?.into_iter().find_map(|kind| match kind {
        MenuItemKind::Submenu(submenu) => submenu.get(id),
        _ => None,
    })
}

/// Gives every registry item the accelerator the view says (a rebinding calls `set_accelerator`).
/// Queued on the main thread. While a recorder listens the menu is off the app: it is applied
/// again when the menu comes back.
pub(crate) fn apply_accelerators(app: &AppHandle, view: &KeyboardView) {
    let handle = app.clone();
    let wanted = accelerators(view, 2);
    let queued = app.run_on_main_thread(move || {
        let Some(menu) = handle.menu() else { return };
        for (id, accelerator) in wanted {
            if let Some(MenuItemKind::MenuItem(item)) = find_item(&menu, id)
                && let Err(error) = item.set_accelerator(accelerator.as_deref())
            {
                eprintln!("menu: could not set the accelerator of {id}: {error}");
            }
        }
    });
    if let Err(error) = queued {
        eprintln!("menu: could not reach the main thread: {error}");
    }
}

/// Whether the capture panel is the key window.
pub(crate) fn capture_is_key(app: &AppHandle) -> bool {
    app.get_webview_window(crate::windows::CAPTURE)
        .is_some_and(|window| window.is_focused().unwrap_or(false))
}
