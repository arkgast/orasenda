//! The menu: item ids, the items per state, the native menu and what a click does.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::{AppHandle, Wry};

use crate::ipc::{Mode, TimerView};
use crate::lifecycle;
use crate::session::{self, Action};

/// Menu labels, also used as the items' ids. Plain and kind, no exclamation marks.
pub(crate) const PAUSE: &str = "Pause";
pub(crate) const RESUME: &str = "Resume";
pub(crate) const END_SESSION: &str = "End session";
pub(crate) const SHOW: &str = "Show Orasenda";
pub(crate) const SETTINGS: &str = "Settings…";
pub(crate) const QUIT: &str = "Quit Orasenda";

/// The menu for `view`, top to bottom. *Pause*/*Resume* and *End session* only while a
/// session runs or is paused.
pub(crate) fn menu_items(view: &TimerView) -> Vec<&'static str> {
    match view.mode {
        Mode::Focus => vec![PAUSE, END_SESSION, SHOW, SETTINGS, QUIT],
        Mode::Paused => vec![RESUME, END_SESSION, SHOW, SETTINGS, QUIT],
        Mode::Idle => vec![SHOW, SETTINGS, QUIT],
    }
}

/// What a menu item does.
pub(crate) enum MenuCommand {
    Session(Action),
    Show,
    Settings,
    Quit,
}

/// The command for a menu item id; `None` for ids that are not the tray's.
pub(crate) fn menu_command(id: &str) -> Option<MenuCommand> {
    match id {
        PAUSE => Some(MenuCommand::Session(Action::Pause)),
        RESUME => Some(MenuCommand::Session(Action::Resume)),
        END_SESSION => Some(MenuCommand::Session(Action::Stop)),
        SHOW => Some(MenuCommand::Show),
        SETTINGS => Some(MenuCommand::Settings),
        QUIT => Some(MenuCommand::Quit),
        _ => None,
    }
}

/// Runs on the main thread. A session action goes to a blocking thread, so the main thread
/// never waits on the service lock or the scheduler.
pub(super) fn on_menu_event(app: &AppHandle, id: &str) {
    match menu_command(id) {
        Some(MenuCommand::Session(action)) => {
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                // `run_action` has already published the true view, so the tray shows it.
                if let Err(error) = session::run_action(&app, action) {
                    eprintln!("tray: menu action refused: {}", error.message);
                }
            });
        }
        Some(MenuCommand::Show) => lifecycle::show_main(app),
        Some(MenuCommand::Settings) => lifecycle::show_settings(app),
        Some(MenuCommand::Quit) => app.exit(0),
        None => {}
    }
}

/// The native menu: the session items, a separator, then *Show* and *Settings…*, a separator, then *Quit*.
pub(super) fn build_menu(app: &AppHandle, items: &[&'static str]) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    for (index, label) in items.iter().enumerate() {
        if (*label == SHOW && index > 0) || *label == QUIT {
            menu.append(&PredefinedMenuItem::separator(app)?)?;
        }
        menu.append(&MenuItem::with_id(app, *label, *label, true, None::<&str>)?)?;
    }
    Ok(menu)
}
