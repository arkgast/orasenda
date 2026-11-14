//! The Focus views' windows (ADR-016, ADR-019): full screen in main and the
//! floater. The pure parts (the window specs, the open and close steps over [`Ops`]) build
//! everywhere and are tested with a fake; [`native`] is the macOS implementation, and every
//! other platform answers `unavailable`.
//!
//! Threading: a window is created from a `spawn_blocking` thread (creation waits on the main
//! thread), and every AppKit call runs on the main thread with no lock held (`tray/mod.rs`).
//! Opening or closing a view never calls the session service apart from the frame store.
// Off macOS only the pure parts compile in; the platform half answers `unavailable`.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use orasenda_service::windows::Frame;
use tauri::AppHandle;

use crate::runtime::session::Action;

use crate::ipc::FocusViewError;

mod capture;
pub(crate) mod displays;
mod floater;
mod floater_keys;
pub(crate) mod frames;
pub(crate) mod full_screen;
mod native;
#[cfg(test)]
mod tests;

#[cfg(desktop)]
pub(crate) use capture::CAPTURE;
pub(crate) use capture::open_capture_on;
pub(crate) use floater::{FLOATER, Toggled, toggle_floater_on};
pub(crate) use native::AppOps;

/// How a window looks and where it loads, apart from its frame.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct WindowSpec {
    pub label: String,
    /// The page under the dev server or the bundle, with its query.
    pub page: String,
    pub title: &'static str,
    pub width: f64,
    pub height: f64,
    pub min_size: Option<(f64, f64)>,
    pub max_size: Option<(f64, f64)>,
    pub decorations: bool,
    pub resizable: bool,
    pub skip_taskbar: bool,
    /// Always false: a window is shown once it is framed.
    pub visible: bool,
}

/// A connected display as the windows module sees it. Frames are integer points relative to
/// the display's top-left.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Screen {
    pub id: String,
    /// The key before the display UUID; frames stored under it move to `id`.
    pub legacy_id: String,
    pub name: String,
    /// The display's size.
    pub size: (u32, u32),
    /// The display without the menu bar and the Dock.
    pub visible: Frame,
}

/// What the open and close steps need from the platform. The macOS implementation runs each
/// AppKit call on the main thread; the tests use a recording fake.
pub(crate) trait Ops {
    /// The connected displays in menu order (the primary first).
    fn screens(&self) -> Result<Vec<Screen>, FocusViewError>;
    /// The display `main` is on, from its recorded frame.
    fn main_display(&self) -> Option<String>;
    fn exists(&self, label: &str) -> bool;
    /// The display a window is on now, from its frame; `None` when it can't be read.
    fn window_display(&self, label: &str) -> Option<String>;
    /// Creates the window hidden. Fails when the label exists.
    fn create(&self, spec: &WindowSpec) -> Result<(), FocusViewError>;
    /// Turns the window into the floating panel (once, before it is shown).
    fn make_floater(&self, label: &str) -> Result<(), FocusViewError>;
    fn place(&self, label: &str, display_id: &str, frame: Frame) -> Result<(), FocusViewError>;
    fn show(&self, label: &str) -> Result<(), FocusViewError>;
    /// Brings an ordinary window forward and focuses it.
    fn focus(&self, label: &str) -> Result<(), FocusViewError>;
    /// Turns the window into the capture panel (once, before it is shown).
    fn make_capture(&self, label: &str) -> Result<(), FocusViewError>;
    /// Sizes the window and puts it on the display under the pointer, in the upper third.
    fn place_at_pointer(&self, label: &str, size: (u32, u32)) -> Result<(), FocusViewError>;
    /// Tells VoiceOver `text`.
    fn announce(&self, text: &str) -> Result<(), FocusViewError>;
    /// Asks the capture page to focus its text area.
    fn emit_capture_focus(&self);
    /// Gives the panel key focus without activating Orasenda.
    fn key(&self, label: &str) -> Result<(), FocusViewError>;
    fn hide_main(&self) -> Result<(), FocusViewError>;
    /// Whether `main` is in native full screen (the floater then leaves it showing).
    fn main_full_screen(&self) -> bool;
    /// The frame to reopen the floater at: `run_frame_load` over these display ids.
    fn load_frame(&self, displays: &[&str]) -> Option<(String, Frame)>;
    /// Moves floater frames stored under each screen's `legacy_id` to its `id`, once.
    fn migrate_frames(&self, screens: &[Screen]);
    fn close(&self, label: &str);
}

/// The screen with `id`, or `noDisplay`.
pub(crate) fn screen_of<'a>(screens: &'a [Screen], id: &str) -> Result<&'a Screen, FocusViewError> {
    screens
        .iter()
        .find(|screen| screen.id == id)
        .ok_or_else(|| FocusViewError::no_display("That display isn't connected."))
}

/// A Focus view opened: the session remembers it (`used.focus_view`, which ends the tip about it).
pub(crate) fn note_opened(app: &AppHandle) {
    if let Err(error) = crate::runtime::session::run_action(app, Action::FocusViewOpened) {
        eprintln!(
            "focus view: could not remember the first open ({})",
            error.message
        );
    }
}

/// Closes the floater, if any; its `CloseRequested` saves the frame.
pub(crate) fn close_floater(app: &AppHandle) {
    floater::close_floater_on(&AppOps::new(app));
}

/// Opens the capture panel on the display under the pointer, or focuses its text.
pub(crate) fn open_capture(app: &AppHandle) -> Result<(), FocusViewError> {
    capture::open_capture_on(&AppOps::new(app))
}

/// Announces "Saved to Inbox." when the save succeeded, and returns the save's result.
pub(crate) fn saved_then_announced<T, E>(app: &AppHandle, saved: Result<T, E>) -> Result<T, E> {
    capture::saved_then_announced(&AppOps::new(app), saved)
}

/// Closes the capture panel, if any.
pub(crate) fn close_capture(app: &AppHandle) {
    capture::close_capture_on(&AppOps::new(app));
}

/// Whether the floater window exists.
pub(crate) fn floater_shown(app: &AppHandle) -> bool {
    AppOps::new(app).exists(FLOATER)
}

/// Shows `main` and asks it to open the command palette.
#[cfg(desktop)]
pub(crate) fn open_palette(app: &AppHandle) {
    emit_palette(app, false);
}

/// Shows `main` and asks it to open the palette with only the display commands. The floater
/// stays as it is, and a `main` already in full screen gets the palette over it.
#[cfg(desktop)]
pub(crate) fn open_palette_displays(app: &AppHandle) {
    emit_palette(app, true);
}

#[cfg(not(desktop))]
pub(crate) fn open_palette_displays(_app: &AppHandle) {}

#[cfg(desktop)]
fn emit_palette(app: &AppHandle, displays_only: bool) {
    use tauri_specta::Event as _;
    crate::lifecycle::show_main(app);
    if let Err(error) =
        (crate::ipc::PaletteOpen { displays_only }).emit_to(app, crate::lifecycle::MAIN)
    {
        eprintln!("windows: could not emit palette-open: {error}");
    }
}

/// Called when the floater opens or is destroyed, and on a display change: the Focus menu and
/// the menu-bar item follow the floater and the displays (`displays::refresh_surfaces`).
#[cfg(desktop)]
pub(crate) fn surfaces_changed(app: &AppHandle) {
    displays::refresh_surfaces(app);
}

#[cfg(not(desktop))]
pub(crate) fn surfaces_changed(_app: &AppHandle) {}
