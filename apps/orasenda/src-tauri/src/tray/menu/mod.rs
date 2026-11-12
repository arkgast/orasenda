//! The menu: item ids, the entries per state, the native menu and what a click does.

mod commands;
mod entries;
mod native;

use orasenda_core::{CustomSpec, Preset};

use crate::ipc::Settings;

pub(in crate::tray) use commands::on_menu_event;
#[cfg(test)]
pub(crate) use commands::{
    MenuCommand, menu_command, preset_choice, settings_target, start_action,
};
pub(crate) use entries::menu_items;
pub(in crate::tray) use native::build_menu;

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
