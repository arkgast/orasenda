//! What a menu item does: the command for an id and how it runs.

use super::*;
use crate::ipc::StartRequest;
use crate::lifecycle;
use crate::runtime::session::{self, Action};
use orasenda_core::PresetId;
use orasenda_service::keyboard::{ActionId, Source};
use tauri::AppHandle;

/// What a menu item does.
#[derive(Debug, PartialEq)]
pub(crate) enum MenuCommand {
    Session(Action),
    /// *Start focus*: the selected preset, read by the service when the item is chosen.
    Start,
    /// *Just 2 minutes*.
    JustTwo,
    SetPreset(PresetId),
    EditTimes,
    /// *Full screen* on the display with this id.
    FullScreen(String),
    ShowFloater,
    HideFloater,
    /// *Capture a thought…*: opens the capture panel.
    Capture,
    Show,
    Settings,
    DevPanel,
    Quit,
}

/// The registry action a tray command runs through `actions::run`, if it is one. Show and Hide
/// are both the floater toggle: the label follows the floater, the action flips it.
pub(crate) fn action_of(command: &MenuCommand) -> Option<ActionId> {
    match command {
        MenuCommand::ShowFloater | MenuCommand::HideFloater => Some(ActionId::Floater),
        MenuCommand::Capture => Some(ActionId::Capture),
        _ => None,
    }
}

/// The command for a menu item id; `None` for ids that are not the tray's.
pub(crate) fn menu_command(id: &str) -> Option<MenuCommand> {
    if let Some(preset) = id.strip_prefix(PRESET_PREFIX) {
        return Some(MenuCommand::SetPreset(PresetId(preset.to_string())));
    }
    if let Some(display) = id.strip_prefix(FULL_SCREEN_PREFIX) {
        return Some(MenuCommand::FullScreen(display.to_string()));
    }
    match id {
        SHOW_FLOATER => Some(MenuCommand::ShowFloater),
        HIDE_FLOATER => Some(MenuCommand::HideFloater),
        CAPTURE => Some(MenuCommand::Capture),
        START => Some(MenuCommand::Start),
        JUST_TWO => Some(MenuCommand::JustTwo),
        EDIT_TIMES => Some(MenuCommand::EditTimes),
        PAUSE => Some(MenuCommand::Session(Action::Pause)),
        RESUME => Some(MenuCommand::Session(Action::Resume)),
        END_SESSION | SKIP_BREAK => Some(MenuCommand::Session(Action::Stop)),
        PAUSE_BREAK => Some(MenuCommand::Session(Action::Pause)),
        RESUME_BREAK => Some(MenuCommand::Session(Action::Resume)),
        ADD_TEN | BACK_TO_FOCUS => Some(MenuCommand::Session(Action::Extend)),
        TAKE_BREAK => Some(MenuCommand::Session(Action::TakeBreak)),
        STOP_HERE => Some(MenuCommand::Session(Action::DismissOffer)),
        KEEP_GOING => Some(MenuCommand::Start),
        SHOW => Some(MenuCommand::Show),
        SETTINGS => Some(MenuCommand::Settings),
        DEV_PANEL => Some(MenuCommand::DevPanel),
        QUIT => Some(MenuCommand::Quit),
        _ => None,
    }
}

/// The start a *Start focus* (`quick: false`) or *Just 2 minutes* item runs: the service
/// starts the selected preset or `quick`.
pub(crate) fn start_action(quick: bool) -> Action {
    Action::Start(StartRequest { quick })
}

/// Where in Settings a menu item opens, when not at the top.
pub(crate) fn settings_target(command: &MenuCommand) -> Option<crate::ipc::SettingsTarget> {
    match command {
        MenuCommand::EditTimes => Some(crate::ipc::SettingsTarget::Timer),
        _ => None,
    }
}

/// Runs on the main thread. Anything that reads or writes the session or the settings goes
/// to a blocking thread, so the main thread never waits on the service lock or the scheduler.
pub(in crate::tray) fn on_menu_event(app: &AppHandle, id: &str) {
    match menu_command(id) {
        Some(MenuCommand::Show) => lifecycle::show_main(app),
        Some(command @ (MenuCommand::Settings | MenuCommand::EditTimes)) => {
            lifecycle::show_settings_on(app, settings_target(&command));
        }
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
pub(crate) fn preset_choice(current: Settings, preset_id: PresetId) -> Settings {
    Settings {
        preset_id,
        ..current
    }
}

/// On a blocking thread. `run_action` has already published the true view, so the tray shows it.
fn run_command(app: &AppHandle, command: MenuCommand) {
    // The floater toggle and capture are registry actions, run like every other route.
    if let Some(id) = action_of(&command) {
        crate::actions::run(app, id, Source::Tray);
        return;
    }
    let action = match command {
        MenuCommand::Session(action) => action,
        MenuCommand::Start => start_action(false),
        MenuCommand::JustTwo => start_action(true),
        MenuCommand::FullScreen(display) => {
            if let Err(error) = crate::windows::full_screen::enter(app, Some(&display)) {
                eprintln!("tray: Full screen didn't open: {}", error.message);
            }
            return;
        }
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
        MenuCommand::ShowFloater
        | MenuCommand::HideFloater
        | MenuCommand::Capture
        | MenuCommand::Show
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tray_floater_and_capture_items_run_actions() {
        assert_eq!(
            action_of(&MenuCommand::ShowFloater),
            Some(ActionId::Floater)
        );
        assert_eq!(
            action_of(&MenuCommand::HideFloater),
            Some(ActionId::Floater)
        );
        assert_eq!(action_of(&MenuCommand::Capture), Some(ActionId::Capture));
        assert_eq!(action_of(&MenuCommand::Quit), None);
    }
}
