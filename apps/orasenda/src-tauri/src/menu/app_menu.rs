//! The app menu: tauri's default menu plus *Settings…* ⌘, right after *About Orasenda*.

//!
//! Registered on macOS only: tauri installs its default menu there alone, and on Windows
//! a `Builder::menu` would add a menu bar to every window. The pure parts compile (and are
//! tested) on every desktop target.

#[cfg(target_os = "macos")]
use tauri::menu::{Menu, MenuItem, MenuItemKind, PredefinedMenuItem};
#[cfg(target_os = "macos")]
use tauri::{AppHandle, Wry};

#[cfg(target_os = "macos")]
use crate::lifecycle;

/// The item's id. Not the tray's `Settings…` label: both handlers see every menu event.
pub(crate) const SETTINGS_ID: &str = "settings";
#[cfg_attr(
    not(any(target_os = "macos", test)),
    expect(dead_code, reason = "macOS builds the menu")
)]
pub(crate) const SETTINGS_TEXT: &str = "Settings…";
#[cfg_attr(
    not(any(target_os = "macos", test)),
    expect(dead_code, reason = "macOS builds the menu")
)]
pub(crate) const SETTINGS_ACCELERATOR: &str = "CmdOrCtrl+,";
/// Where in the app submenu the separator and *Settings…* go: right after *About* (index 0).
#[cfg_attr(
    not(any(target_os = "macos", test)),
    expect(dead_code, reason = "macOS builds the menu")
)]
pub(crate) const SETTINGS_AT: usize = 1;

/// What `build` inserts into the app submenu, in order. `build` and the tested model
/// [`app_menu_ids`] both read this, so they cannot drift.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Inserted {
    Separator,
    Settings,
}

#[cfg_attr(
    not(any(target_os = "macos", test)),
    expect(dead_code, reason = "macOS builds the menu")
)]
pub(crate) const INSERTED: [Inserted; 2] = [Inserted::Separator, Inserted::Settings];

/// The app submenu's ids after `build` inserts [`INSERTED`] at [`SETTINGS_AT`] into the
/// default submenu's ids (`default`, in order); `separator` is the new separator's id.
#[cfg_attr(
    not(test),
    expect(dead_code, reason = "tested pure model of what build inserts")
)]
pub(crate) fn app_menu_ids(default: &[String], separator: &str) -> Vec<String> {
    let at = SETTINGS_AT.min(default.len());
    let mut ids = default.to_vec();
    ids.splice(
        at..at,
        INSERTED.map(|i| match i {
            Inserted::Separator => separator.to_owned(),
            Inserted::Settings => SETTINGS_ID.to_owned(),
        }),
    );
    ids
}

/// Whether `id` is an app-menu command this module handles.
#[cfg_attr(
    not(any(target_os = "macos", test)),
    expect(dead_code, reason = "macOS handles the event")
)]
pub(crate) fn is_app_menu_command(id: &str) -> bool {
    id == SETTINGS_ID
}

/// `Menu::default` with *Settings…* ⌘, after *About Orasenda*. Fails the launch if the
/// default menu has no app submenu first (tauri 2.12.5 on macOS always has one).
#[cfg(target_os = "macos")]
pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::default(app)?;
    let Some(MenuItemKind::Submenu(submenu)) = menu.items()?.into_iter().next() else {
        return Err(tauri::Error::Io(std::io::Error::other(
            "app_menu: the default menu has no app submenu to add Settings to",
        )));
    };
    let separator = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(
        app,
        SETTINGS_ID,
        SETTINGS_TEXT,
        true,
        Some(SETTINGS_ACCELERATOR),
    )?;
    let items: Vec<&dyn tauri::menu::IsMenuItem<Wry>> = INSERTED
        .iter()
        .map(|i| match i {
            Inserted::Separator => &separator as &dyn tauri::menu::IsMenuItem<Wry>,
            Inserted::Settings => &settings,
        })
        .collect();
    submenu.insert_items(&items, SETTINGS_AT)?;
    Ok(menu)
}

/// Handles the app menu's events; ignores every id it does not own.
#[cfg(target_os = "macos")]
pub(crate) fn on_menu_event(app: &AppHandle, id: &str) {
    if is_app_menu_command(id) {
        lifecycle::show_settings(app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tray::{END_SESSION, PAUSE, QUIT, RESUME, SETTINGS, SHOW, menu_command};

    fn ids(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| (*s).to_owned()).collect()
    }

    #[test]
    fn app_menu_has_settings_after_about_with_cmd_comma() {
        let default = ids(&[
            "about",
            "sep1",
            "services",
            "sep2",
            "hide",
            "hide-others",
            "sep3",
            "quit",
        ]);
        let got = app_menu_ids(&default, "new-sep");
        assert_eq!(got[..4], ids(&["about", "new-sep", "settings", "sep1"])[..]);
        let without: Vec<_> = got
            .iter()
            .filter(|i| *i != "new-sep" && *i != SETTINGS_ID)
            .cloned()
            .collect();
        assert_eq!(without, default);
        assert_eq!(SETTINGS_TEXT, "Settings\u{2026}");
        assert_eq!(SETTINGS_ACCELERATOR, "CmdOrCtrl+,");
        assert_eq!(SETTINGS_AT, 1);
        assert_eq!(INSERTED, [Inserted::Separator, Inserted::Settings]);
    }

    #[test]
    fn app_menu_ids_disjoint_from_tray_ids() {
        let own = app_menu_ids(&ids(&["about"]), "sep");
        for label in [PAUSE, RESUME, END_SESSION, SHOW, SETTINGS, QUIT] {
            assert!(!own.iter().any(|i| i == label), "{label}");
            assert!(!is_app_menu_command(label), "{label}");
        }
        assert!(menu_command(SETTINGS_ID).is_none());
    }
}
