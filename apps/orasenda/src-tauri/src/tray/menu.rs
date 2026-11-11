//! The menu: item ids, the entries per state, the native menu and what a click does.

use orasenda_core::{CustomSpec, Preset};
use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Wry};

use crate::ipc::{Mode, Settings, StartRequest, TimerView};
use crate::lifecycle;
use crate::runtime::session::{self, Action};

/// Menu ids. The labels the user reads are in [`menu_items`]. Plain and kind, no exclamation marks.
pub(crate) const START: &str = "start";
pub(crate) const JUST_TWO: &str = "just-two";
pub(crate) const EDIT_TIMES: &str = "edit-times";
pub(crate) const HEADER: &str = "header";
pub(crate) const PAUSE: &str = "Pause session";
pub(crate) const RESUME: &str = "Resume session";
pub(crate) const END_SESSION: &str = "End session";
pub(crate) const SHOW: &str = "Show Orasenda";
pub(crate) const SETTINGS: &str = "Settings…";
pub(crate) const DEV_PANEL: &str = "developer-panel";
pub(crate) const QUIT: &str = "Quit Orasenda";

/// The four presets the submenu lists, in order.
const PRESETS: [Preset; 4] = [
    Preset::Classic,
    Preset::FiftyTen,
    Preset::DeepBlock,
    Preset::Custom,
];

/// The next session while idle: the saved preset, its focus minutes and the Custom minutes
/// (the Custom check item shows them).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct NextSession {
    pub(crate) preset: Preset,
    pub(crate) focus_min: u32,
    pub(crate) custom: CustomSpec,
}

impl Default for NextSession {
    fn default() -> NextSession {
        NextSession::from_settings(&Settings::default())
    }
}

impl NextSession {
    pub(crate) fn from_settings(settings: &Settings) -> NextSession {
        let focus_min = match settings.preset.spec(&settings.custom) {
            Ok(spec) => u32::try_from(spec.focus_ms / 60_000).unwrap_or(25),
            Err(error) => {
                eprintln!("tray: the saved preset has no length ({error}); showing 25");
                25
            }
        };
        NextSession {
            preset: settings.preset,
            focus_min,
            custom: settings.custom,
        }
    }
}

/// One line of the menu, before it becomes a native item. Equal lists mean no rebuild.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum MenuEntry {
    /// `checked: Some(_)` makes it a check item.
    Item {
        id: &'static str,
        label: String,
        accelerator: Option<&'static str>,
        checked: Option<bool>,
    },
    /// The disabled status header; its text is [`header_text`](super::render::header_text),
    /// set with `set_text` so a new minute doesn't rebuild the menu.
    Header,
    Separator,
    Submenu {
        label: &'static str,
        entries: Vec<MenuEntry>,
    },
}

fn item(id: &'static str, label: &str) -> MenuEntry {
    MenuEntry::Item {
        id,
        label: label.to_string(),
        accelerator: None,
        checked: None,
    }
}

fn with_accelerator(id: &'static str, label: &str, accelerator: &'static str) -> MenuEntry {
    MenuEntry::Item {
        id,
        label: label.to_string(),
        accelerator: Some(accelerator),
        checked: None,
    }
}

fn preset_id(preset: Preset) -> &'static str {
    match preset {
        Preset::Classic => "preset:classic",
        Preset::FiftyTen => "preset:fifty_ten",
        Preset::DeepBlock => "preset:deep_block",
        Preset::Custom => "preset:custom",
        Preset::Quick => "preset:quick",
    }
}

/// The preset check item's label, as in the Today popover.
fn preset_label(preset: Preset, custom: &CustomSpec) -> String {
    match preset {
        Preset::Classic => "Classic 25 / 5".to_string(),
        Preset::FiftyTen => "50/10 50 / 10".to_string(),
        Preset::DeepBlock => "Deep Block 90 / 15".to_string(),
        Preset::Custom => format!("Custom {} / {}", custom.focus_min, custom.break_min),
        Preset::Quick => "Just 2 minutes".to_string(),
    }
}

/// The menu for `view`, top to bottom. `spike` adds the Developer panel item, in its own
/// group above Quit.
pub(crate) fn menu_items(view: &TimerView, next: &NextSession, spike: bool) -> Vec<MenuEntry> {
    let mut entries = match view.mode {
        Mode::Idle => {
            let mut presets: Vec<MenuEntry> = PRESETS
                .iter()
                .map(|&preset| MenuEntry::Item {
                    id: preset_id(preset),
                    label: preset_label(preset, &next.custom),
                    accelerator: None,
                    checked: Some(preset == next.preset),
                })
                .collect();
            presets.push(MenuEntry::Separator);
            presets.push(item(EDIT_TIMES, "Edit times in Settings…"));
            vec![
                item(START, &format!("Start focus · {} min", next.focus_min)),
                item(JUST_TWO, "Just 2 minutes"),
                MenuEntry::Submenu {
                    label: "Preset",
                    entries: presets,
                },
            ]
        }
        Mode::Focus => vec![
            MenuEntry::Header,
            MenuEntry::Separator,
            item(PAUSE, PAUSE),
            item(END_SESSION, END_SESSION),
        ],
        Mode::Paused => vec![
            MenuEntry::Header,
            MenuEntry::Separator,
            item(RESUME, RESUME),
            item(END_SESSION, END_SESSION),
        ],
    };
    entries.extend([
        MenuEntry::Separator,
        item(SHOW, SHOW),
        with_accelerator(SETTINGS, SETTINGS, "CmdOrCtrl+,"),
        MenuEntry::Separator,
    ]);
    if spike {
        entries.extend([item(DEV_PANEL, "Developer panel"), MenuEntry::Separator]);
    }
    entries.extend([with_accelerator(QUIT, QUIT, "CmdOrCtrl+Q")]);
    entries
}

/// What a menu item does.
#[derive(Debug, PartialEq)]
pub(crate) enum MenuCommand {
    Session(Action),
    /// *Start focus*: the saved preset, read when the item is chosen.
    Start,
    /// *Just 2 minutes*.
    JustTwo,
    SetPreset(Preset),
    EditTimes,
    Show,
    Settings,
    DevPanel,
    Quit,
}

/// The command for a menu item id; `None` for ids that are not the tray's.
pub(crate) fn menu_command(id: &str) -> Option<MenuCommand> {
    if let Some(preset) = PRESETS.iter().find(|&&preset| preset_id(preset) == id) {
        return Some(MenuCommand::SetPreset(*preset));
    }
    match id {
        START => Some(MenuCommand::Start),
        JUST_TWO => Some(MenuCommand::JustTwo),
        EDIT_TIMES => Some(MenuCommand::EditTimes),
        PAUSE => Some(MenuCommand::Session(Action::Pause)),
        RESUME => Some(MenuCommand::Session(Action::Resume)),
        END_SESSION => Some(MenuCommand::Session(Action::Stop)),
        SHOW => Some(MenuCommand::Show),
        SETTINGS => Some(MenuCommand::Settings),
        DEV_PANEL => Some(MenuCommand::DevPanel),
        QUIT => Some(MenuCommand::Quit),
        _ => None,
    }
}

/// The start a *Start focus* (`quick: false`) or *Just 2 minutes* item runs: the saved
/// preset or `quick`, never custom minutes.
pub(crate) fn start_action(saved: Preset, quick: bool) -> Action {
    Action::Start(StartRequest {
        preset: if quick { Preset::Quick } else { saved },
        custom: None,
    })
}

/// Runs on the main thread. Anything that reads or writes the session or the settings goes
/// to a blocking thread, so the main thread never waits on the service lock or the scheduler.
pub(super) fn on_menu_event(app: &AppHandle, id: &str) {
    match menu_command(id) {
        Some(MenuCommand::Show) => lifecycle::show_main(app),
        // The page has no Timer anchor yet, so this opens Settings.
        Some(MenuCommand::Settings | MenuCommand::EditTimes) => lifecycle::show_settings(app),
        Some(MenuCommand::Quit) => app.exit(0),
        // Creating a window waits on the main thread, so it runs on a blocking thread.
        Some(MenuCommand::DevPanel) => {
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                if let Err(error) = crate::spike::window::open_dev_panel(&app) {
                    eprintln!("tray: could not open the Developer panel: {error}");
                }
            });
        }
        Some(command) => {
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || run_command(&app, command));
        }
        None => {}
    }
}

/// `current` with the chosen preset and nothing else changed.
pub(crate) fn preset_choice(current: Settings, preset: Preset) -> Settings {
    Settings { preset, ..current }
}

/// On a blocking thread. `run_action` has already published the true view, so the tray shows it.
fn run_command(app: &AppHandle, command: MenuCommand) {
    let action = match command {
        MenuCommand::Session(action) => action,
        MenuCommand::Start => start_action(session::current_settings(app).preset, false),
        MenuCommand::JustTwo => start_action(Preset::Quick, true),
        MenuCommand::SetPreset(preset) => {
            // The same chain `settings_set` uses: it saves, then emits `settings-changed`.
            let settings = preset_choice(session::current_settings(app), preset);
            let saved = session::run_set_settings(app, settings);
            if let Err(error) = &saved {
                eprintln!("tray: could not save the preset: {}", error.message);
            }
            // The menu already toggled the clicked check item. A failed save emits nothing, so
            // tell the tray the saved settings again: it rebuilds the menu and the true preset
            // shows. (A save emits `settings-changed`, which does the same.)
            if saved.is_err() {
                crate::runtime::events::resync_surfaces(app, &session::current_settings(app));
            }
            return;
        }
        MenuCommand::Show
        | MenuCommand::Settings
        | MenuCommand::EditTimes
        | MenuCommand::DevPanel
        | MenuCommand::Quit => {
            return;
        }
    };
    if let Err(error) = session::run_action(app, action) {
        eprintln!("tray: menu action refused: {}", error.message);
    }
}

/// Appends `entries` to `append`; `header` collects the header item for `set_text`.
fn append_entries(
    app: &AppHandle,
    entries: &[MenuEntry],
    header_text: Option<&str>,
    header: &mut Option<MenuItem<Wry>>,
    append: &mut dyn FnMut(&dyn IsMenuItem<Wry>) -> tauri::Result<()>,
) -> tauri::Result<()> {
    for entry in entries {
        match entry {
            MenuEntry::Item {
                id,
                label,
                accelerator,
                checked: None,
            } => append(&MenuItem::with_id(app, *id, label, true, *accelerator)?)?,
            MenuEntry::Item {
                id,
                label,
                accelerator,
                checked: Some(checked),
            } => append(&CheckMenuItem::with_id(
                app,
                *id,
                label,
                true,
                *checked,
                *accelerator,
            )?)?,
            MenuEntry::Header => {
                let item =
                    MenuItem::with_id(app, HEADER, header_text.unwrap_or(""), false, None::<&str>)?;
                append(&item)?;
                *header = Some(item);
            }
            MenuEntry::Separator => append(&PredefinedMenuItem::separator(app)?)?,
            MenuEntry::Submenu { label, entries } => {
                let submenu = Submenu::new(app, *label, true)?;
                append_entries(app, entries, header_text, header, &mut |child| {
                    submenu.append(child)
                })?;
                append(&submenu)?;
            }
        }
    }
    Ok(())
}

/// The native menu for `entries`, and its header item when there is one.
pub(super) fn build_menu(
    app: &AppHandle,
    entries: &[MenuEntry],
    header_text: Option<&str>,
) -> tauri::Result<(Menu<Wry>, Option<MenuItem<Wry>>)> {
    let menu = Menu::new(app)?;
    let mut header = None;
    append_entries(app, entries, header_text, &mut header, &mut |child| {
        menu.append(child)
    })?;
    Ok((menu, header))
}
