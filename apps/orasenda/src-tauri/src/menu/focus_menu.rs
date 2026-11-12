//! The Focus menu in the app menu bar, after View: Full Screen ⇧⌘F, Floating Timer ⇧⌘T and
//! Commands… ⌘K (spec: The Focus menu). Rust owns the three accelerators, so they work from
//! every Orasenda window; the webviews bind none of them.
//!
//! The pure model [`focus_menu_entries`] is tested on every desktop target; the native build
//! and its rebuild on a display change are macOS only. The ids all start with `focus:`, which
//! no tray or `popup:` id does.

// Off macOS the menu is not built; the pure model is still tested.
#![cfg_attr(not(any(target_os = "macos", test)), allow(dead_code))]

use crate::ipc::DisplayInfo;

/// The submenu's id, to find it again when the displays change.
pub(crate) const FOCUS_MENU_ID: &str = "focus:menu";
/// The id prefix of a Full Screen item; the rest is the display id.
pub(crate) const FULL_SCREEN_PREFIX: &str = "focus:fullscreen:";
pub(crate) const FLOATER_ID: &str = "focus:floater";
pub(crate) const COMMANDS_ID: &str = "focus:commands";
const ID_PREFIX: &str = "focus:";

pub(crate) const FULL_SCREEN_ACCELERATOR: &str = "CmdOrCtrl+Shift+F";
pub(crate) const FLOATER_ACCELERATOR: &str = "CmdOrCtrl+Shift+T";
pub(crate) const COMMANDS_ACCELERATOR: &str = "CmdOrCtrl+K";

/// One line of the Focus menu, before it becomes a native item.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum FocusMenuEntry {
    Item {
        id: String,
        label: String,
        accelerator: Option<&'static str>,
    },
    Separator,
    Submenu {
        label: &'static str,
        entries: Vec<FocusMenuEntry>,
    },
}

fn item(id: String, label: String, accelerator: Option<&'static str>) -> FocusMenuEntry {
    FocusMenuEntry::Item {
        id,
        label,
        accelerator,
    }
}

/// The Focus menu for `displays` (the main window's first, as `displays_list` orders them).
///
/// One display gives *Full Screen*; several give a *Full Screen* submenu with one
/// "Full screen on <name>" item each, and only the first (the main window's display)
/// carries ⇧⌘F. No displays gives no Full Screen item. *Floating Timer* reads the same
/// whether the floater is shown or not: it opens the floater or gives it key focus, and never
/// hides it (the tray and Esc close it). The flag is here so the menu follows the floater.
pub(crate) fn focus_menu_entries(
    displays: &[DisplayInfo],
    _floater_shown: bool,
) -> Vec<FocusMenuEntry> {
    let full_screen_id = |display: &DisplayInfo| format!("{FULL_SCREEN_PREFIX}{}", display.id);
    let mut entries = match displays {
        [] => Vec::new(),
        [only] => vec![item(
            full_screen_id(only),
            "Full Screen".to_string(),
            Some(FULL_SCREEN_ACCELERATOR),
        )],
        many => vec![FocusMenuEntry::Submenu {
            label: "Full Screen",
            entries: many
                .iter()
                .enumerate()
                .map(|(index, display)| {
                    item(
                        full_screen_id(display),
                        format!("Full screen on {}", display.name),
                        (index == 0).then_some(FULL_SCREEN_ACCELERATOR),
                    )
                })
                .collect(),
        }],
    };
    entries.extend([
        item(
            FLOATER_ID.to_string(),
            "Floating Timer".to_string(),
            Some(FLOATER_ACCELERATOR),
        ),
        FocusMenuEntry::Separator,
        item(
            COMMANDS_ID.to_string(),
            "Commands…".to_string(),
            Some(COMMANDS_ACCELERATOR),
        ),
    ]);
    entries
}

/// What a Focus menu item does.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum FocusCommand {
    /// Open (or focus) the Focus window of the display with this id.
    FullScreen(String),
    /// Open the floater, or give it key focus.
    Floater,
    /// Bring `main` forward and ask it to open the command palette.
    Commands,
}

/// The command for a menu id; `None` for ids that are not the Focus menu's.
pub(crate) fn focus_command(id: &str) -> Option<FocusCommand> {
    if let Some(display) = id.strip_prefix(FULL_SCREEN_PREFIX) {
        return Some(FocusCommand::FullScreen(display.to_string()));
    }
    match id {
        FLOATER_ID => Some(FocusCommand::Floater),
        COMMANDS_ID => Some(FocusCommand::Commands),
        _ => None,
    }
}

/// Whether `id` belongs to the Focus menu.
pub(crate) fn is_focus_id(id: &str) -> bool {
    id.starts_with(ID_PREFIX)
}

#[cfg(target_os = "macos")]
pub(crate) use native::{build_submenu, on_menu_event, rebuild};

#[cfg(target_os = "macos")]
mod native {
    use tauri::menu::{IsMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu};
    use tauri::{AppHandle, Wry};

    use super::{FOCUS_MENU_ID, FocusCommand, FocusMenuEntry, focus_command, focus_menu_entries};
    use crate::ipc::DisplayInfo;

    fn append_entries(
        app: &AppHandle,
        entries: &[FocusMenuEntry],
        append: &mut dyn FnMut(&dyn IsMenuItem<Wry>) -> tauri::Result<()>,
    ) -> tauri::Result<()> {
        for entry in entries {
            match entry {
                FocusMenuEntry::Item {
                    id,
                    label,
                    accelerator,
                } => append(&MenuItem::with_id(
                    app,
                    id.as_str(),
                    label,
                    true,
                    *accelerator,
                )?)?,
                FocusMenuEntry::Separator => append(&PredefinedMenuItem::separator(app)?)?,
                FocusMenuEntry::Submenu { label, entries } => {
                    let submenu = Submenu::new(app, *label, true)?;
                    append_entries(app, entries, &mut |child| submenu.append(child))?;
                    append(&submenu)?;
                }
            }
        }
        Ok(())
    }

    /// The *Focus* submenu for `displays`, ready to insert after View.
    pub(crate) fn build_submenu(
        app: &AppHandle,
        displays: &[DisplayInfo],
        floater_shown: bool,
    ) -> tauri::Result<Submenu<Wry>> {
        let submenu = Submenu::with_id(app, FOCUS_MENU_ID, "Focus", true)?;
        let entries = focus_menu_entries(displays, floater_shown);
        append_entries(app, &entries, &mut |child| submenu.append(child))?;
        Ok(submenu)
    }

    /// Rebuilds the items of the installed Focus menu for the new displays and floater.
    /// Main thread only. Fails, loudly, when the app menu has no Focus submenu.
    pub(crate) fn rebuild(
        app: &AppHandle,
        displays: &[DisplayInfo],
        floater_shown: bool,
    ) -> tauri::Result<()> {
        let missing =
            |what: &str| tauri::Error::Io(std::io::Error::other(format!("focus_menu: {what}")));
        let menu: Menu<Wry> = app.menu().ok_or_else(|| missing("the app has no menu"))?;
        let Some(MenuItemKind::Submenu(submenu)) = menu.get(FOCUS_MENU_ID) else {
            return Err(missing("the app menu has no Focus submenu"));
        };
        for existing in submenu.items()? {
            submenu.remove(&existing)?;
        }
        let entries = focus_menu_entries(displays, floater_shown);
        append_entries(app, &entries, &mut |child| submenu.append(child))
    }

    /// Handles the Focus menu's events on the main thread; ignores every id it does not own.
    /// Opening a window waits on the main thread, so it runs on a blocking thread.
    pub(crate) fn on_menu_event(app: &AppHandle, id: &str) {
        match focus_command(id) {
            Some(FocusCommand::FullScreen(display)) => {
                let app = app.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    if let Err(error) = crate::windows::open_focus(&app, &display) {
                        eprintln!("focus_menu: Full Screen didn't open: {}", error.message);
                    }
                });
            }
            Some(FocusCommand::Floater) => {
                let app = app.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    if let Err(error) = crate::windows::open_floater(&app) {
                        eprintln!(
                            "focus_menu: the floating timer didn't open: {}",
                            error.message
                        );
                    }
                });
            }
            Some(FocusCommand::Commands) => crate::windows::open_palette(app),
            None => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::menu::app_menu::{SETTINGS_ID, app_menu_ids, is_app_menu_command};
    use crate::tray::{END_SESSION, PAUSE, QUIT, RESUME, SETTINGS, SHOW, menu_command};

    fn display(id: &str, name: &str, main: bool) -> DisplayInfo {
        DisplayInfo {
            id: id.into(),
            name: name.into(),
            has_main_window: main,
        }
    }

    fn items_of(entries: &[FocusMenuEntry]) -> Vec<(String, String, Option<&'static str>)> {
        let mut out = Vec::new();
        for entry in entries {
            match entry {
                FocusMenuEntry::Item {
                    id,
                    label,
                    accelerator,
                } => out.push((id.clone(), label.clone(), *accelerator)),
                FocusMenuEntry::Submenu { entries, .. } => out.extend(items_of(entries)),
                FocusMenuEntry::Separator => {}
            }
        }
        out
    }

    #[test]
    fn focus_menu_entries_one_display() {
        let entries = focus_menu_entries(&[display("A", "Built-in Retina Display", true)], false);
        assert_eq!(
            entries,
            [
                item(
                    "focus:fullscreen:A".into(),
                    "Full Screen".into(),
                    Some("CmdOrCtrl+Shift+F")
                ),
                item(
                    "focus:floater".into(),
                    "Floating Timer".into(),
                    Some("CmdOrCtrl+Shift+T")
                ),
                FocusMenuEntry::Separator,
                item(
                    "focus:commands".into(),
                    "Commands…".into(),
                    Some("CmdOrCtrl+K")
                ),
            ]
        );
    }

    #[test]
    fn focus_menu_entries_two_displays_main_first() {
        let entries = focus_menu_entries(
            &[
                display("A", "Built-in Retina Display", true),
                display("B", "DELL U2720Q", false),
            ],
            true,
        );
        let FocusMenuEntry::Submenu {
            label,
            entries: sub,
        } = &entries[0]
        else {
            panic!("several displays make a Full Screen submenu: {entries:?}");
        };
        assert_eq!(*label, "Full Screen");
        assert_eq!(
            items_of(sub),
            [
                (
                    "focus:fullscreen:A".to_string(),
                    "Full screen on Built-in Retina Display".to_string(),
                    Some("CmdOrCtrl+Shift+F")
                ),
                (
                    "focus:fullscreen:B".to_string(),
                    "Full screen on DELL U2720Q".to_string(),
                    None
                ),
            ]
        );
        assert_eq!(items_of(&entries[1..])[0].1, "Floating Timer");
    }

    #[test]
    fn focus_menu_entries_three_displays_shortcut_on_first_only() {
        let displays = [
            display("A", "One", true),
            display("B", "Two", false),
            display("C", "Three", false),
        ];
        let entries = focus_menu_entries(&displays, false);
        let with_f: Vec<_> = items_of(&entries)
            .into_iter()
            .filter(|(_, _, accelerator)| *accelerator == Some(FULL_SCREEN_ACCELERATOR))
            .map(|(id, ..)| id)
            .collect();
        assert_eq!(with_f, ["focus:fullscreen:A"]);
        assert_eq!(
            items_of(&entries).len(),
            3 + 2,
            "three displays, the timer, Commands"
        );
    }

    #[test]
    fn focus_menu_without_displays_has_no_full_screen() {
        let labels: Vec<_> = items_of(&focus_menu_entries(&[], false))
            .into_iter()
            .map(|(_, label, _)| label)
            .collect();
        assert_eq!(labels, ["Floating Timer", "Commands…"]);
    }

    #[test]
    fn focus_menu_ids_disjoint() {
        let displays = [display("A", "One", true), display("B", "Two", false)];
        let own: Vec<String> = items_of(&focus_menu_entries(&displays, false))
            .into_iter()
            .map(|(id, ..)| id)
            .collect();
        for id in &own {
            assert!(is_focus_id(id), "{id}");
            assert!(focus_command(id).is_some(), "{id}");
            assert!(!is_app_menu_command(id), "{id}");
            assert!(menu_command(id).is_none(), "{id}");
            assert!(!id.starts_with("popup:"), "{id}");
        }
        for foreign in [
            PAUSE,
            RESUME,
            END_SESSION,
            SHOW,
            SETTINGS,
            QUIT,
            SETTINGS_ID,
        ] {
            assert!(!is_focus_id(foreign), "{foreign}");
            assert!(focus_command(foreign).is_none(), "{foreign}");
        }
        for tray_id in ["full-screen:A", "show-floater", "hide-floater", "popup:x"] {
            assert!(focus_command(tray_id).is_none(), "{tray_id}");
        }
        assert!(own.iter().all(|id| id != FOCUS_MENU_ID));
        assert!(
            !app_menu_ids(&["about".to_string()], "sep")
                .iter()
                .any(|i| is_focus_id(i))
        );
    }

    /// One ⌘K in `main` reaches the menu once: the chord is registered by exactly one item in
    /// the app menu, that item has exactly one handler, and the handler is the one that emits
    /// `palette-open` (`windows::open_palette`). The webview binds no ⌘K (hands-on check H7).
    #[test]
    fn cmd_k_emits_palette_open_once() {
        for displays in [
            Vec::new(),
            vec![display("A", "One", true)],
            vec![display("A", "One", true), display("B", "Two", false)],
        ] {
            let registered: Vec<_> = items_of(&focus_menu_entries(&displays, false))
                .into_iter()
                .filter(|(_, _, accelerator)| *accelerator == Some(COMMANDS_ACCELERATOR))
                .collect();
            assert_eq!(registered.len(), 1, "{displays:?}");
            assert_eq!(registered[0].0, COMMANDS_ID);
        }
        assert_eq!(focus_command(COMMANDS_ID), Some(FocusCommand::Commands));
        assert_eq!(super::super::route(COMMANDS_ID), super::super::Route::Focus);
        assert!(!is_app_menu_command(COMMANDS_ID));
        assert!(menu_command(COMMANDS_ID).is_none());
    }
}
