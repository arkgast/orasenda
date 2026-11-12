//! The menu: item ids, the entries per state, the native menu and what a click does.

mod commands;
mod entries;
mod native;

use orasenda_core::{PresetId, default_presets};

use crate::ipc::{DisplayInfo, PresetEntry, Settings, entries};

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

/// The id prefix of a Full screen item; the rest is the display id. Not `focus:`, the app
/// menu's prefix: both handlers see every menu event.
pub(crate) const FULL_SCREEN_PREFIX: &str = "full-screen:";
pub(crate) const SHOW_FLOATER: &str = "show-floater";
pub(crate) const HIDE_FLOATER: &str = "hide-floater";

/// What the Focus views add to the menu: the connected displays (the main window's first)
/// and whether the floater is shown. No displays means no Focus items (off macOS, or the
/// displays could not be read).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct FocusItems {
    pub(crate) displays: Vec<DisplayInfo>,
    pub(crate) floater_shown: bool,
}

/// The id prefix of a Preset submenu item; the rest is the library preset's id.
pub(crate) const PRESET_PREFIX: &str = "preset:";

/// The next session while idle: the library, and which preset is selected.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct NextSession {
    /// The live presets, in order.
    pub(crate) presets: Vec<PresetEntry>,
    /// The selected preset (the first when the id is not in `presets`).
    pub(crate) selected: PresetId,
}

impl Default for NextSession {
    fn default() -> NextSession {
        NextSession::new(&Settings::default(), entries(&default_presets()))
    }
}

impl NextSession {
    pub(crate) fn new(settings: &Settings, presets: Vec<PresetEntry>) -> NextSession {
        let selected = match presets.iter().find(|p| p.id == settings.preset_id) {
            Some(found) => found.id.clone(),
            None => presets
                .first()
                .map_or_else(|| settings.preset_id.clone(), |p| p.id.clone()),
        };
        NextSession { presets, selected }
    }

    /// The same library with the selection of `settings`.
    pub(crate) fn with_settings(&self, settings: &Settings) -> NextSession {
        NextSession::new(settings, self.presets.clone())
    }

    /// The same selection over a changed library.
    pub(crate) fn with_presets(&self, presets: Vec<PresetEntry>) -> NextSession {
        let settings = Settings {
            preset_id: self.selected.clone(),
            ..Settings::default()
        };
        NextSession::new(&settings, presets)
    }

    /// The selected preset's focus minutes; 25 when the library is empty.
    pub(crate) fn focus_min(&self) -> u32 {
        self.presets
            .iter()
            .find(|p| p.id == self.selected)
            .map_or(25, |p| u32::from(p.focus_min))
    }
}

/// One line of the menu, before it becomes a native item. Equal lists mean no rebuild.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum MenuEntry {
    /// `checked: Some(_)` makes it a check item.
    Item {
        id: String,
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
