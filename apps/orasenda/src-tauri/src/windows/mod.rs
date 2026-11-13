//! The Focus views' windows (ADR-016): the full-screen Focus window per display and the
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

use crate::ipc::{FocusInsets, FocusViewError};

pub(crate) mod displays;
mod floater;
mod floater_keys;
pub(crate) mod focus;
pub(crate) mod frames;
mod native;
#[cfg(test)]
mod tests;

pub(crate) use floater::FLOATER;
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
    pub insets: FocusInsets,
}

/// What the open and close steps need from the platform. The macOS implementation runs each
/// AppKit call on the main thread; the tests use a recording fake.
pub(crate) trait Ops {
    /// The connected displays in menu order (the primary first).
    fn screens(&self) -> Result<Vec<Screen>, FocusViewError>;
    /// The display `main` is on, from its recorded frame.
    fn main_display(&self) -> Option<String>;
    fn exists(&self, label: &str) -> bool;
    /// The labels of the open Focus windows.
    fn focus_labels(&self) -> Vec<String>;
    /// The display a window is on now, from its frame; `None` when it can't be read.
    fn window_display(&self, label: &str) -> Option<String>;
    /// Creates the window hidden. Fails when the label exists.
    fn create(&self, spec: &WindowSpec) -> Result<(), FocusViewError>;
    /// Frames a Focus window to the whole display.
    fn cover_display(&self, label: &str, display_id: &str) -> Result<(), FocusViewError>;
    /// Turns the window into the floating panel (once, before it is shown).
    fn make_floater(&self, label: &str) -> Result<(), FocusViewError>;
    fn place(&self, label: &str, display_id: &str, frame: Frame) -> Result<(), FocusViewError>;
    fn show(&self, label: &str) -> Result<(), FocusViewError>;
    /// Brings an ordinary window forward and focuses it.
    fn focus(&self, label: &str) -> Result<(), FocusViewError>;
    /// Gives the panel key focus without activating Orasenda.
    fn key(&self, label: &str) -> Result<(), FocusViewError>;
    fn hide_main(&self) -> Result<(), FocusViewError>;
    /// The frame to reopen the floater at: `run_frame_load` over these display ids.
    fn load_frame(&self, displays: &[&str]) -> Option<(String, Frame)>;
    /// Moves floater frames stored under each screen's `legacy_id` to its `id`, once.
    fn migrate_frames(&self, _screens: &[Screen]) {}
    fn emit_insets(&self, label: &str, insets: FocusInsets);
    fn close(&self, label: &str);
}

/// The screen with `id`, or `noDisplay`.
pub(crate) fn screen_of<'a>(screens: &'a [Screen], id: &str) -> Result<&'a Screen, FocusViewError> {
    screens
        .iter()
        .find(|screen| screen.id == id)
        .ok_or_else(|| FocusViewError::no_display("That display isn't connected."))
}

/// Opens (or focuses) the Focus window of a display.
pub(crate) fn open_focus(app: &AppHandle, display_id: &str) -> Result<(), FocusViewError> {
    focus::open_focus_on(&AppOps::new(app), display_id)
}

/// Opens the floater at its remembered frame, or focuses it when shown; then hides `main`.
pub(crate) fn open_floater(app: &AppHandle) -> Result<(), FocusViewError> {
    let result = floater::open_floater_on(&AppOps::new(app));
    surfaces_changed(app);
    result
}

/// Closes the floater, if any; its `CloseRequested` saves the frame.
pub(crate) fn close_floater(app: &AppHandle) {
    floater::close_floater_on(&AppOps::new(app));
}

/// Whether the floater window exists.
pub(crate) fn floater_shown(app: &AppHandle) -> bool {
    AppOps::new(app).exists(FLOATER)
}

/// The display `main` is on: its recorded display, or the primary one.
pub(crate) fn main_display(app: &AppHandle) -> Option<String> {
    let ops = AppOps::new(app);
    ops.main_display()
        .or_else(|| ops.screens().ok()?.into_iter().next().map(|s| s.id))
}

/// Shows `main` and asks it to open the command palette.
#[cfg(desktop)]
pub(crate) fn open_palette(app: &AppHandle) {
    use tauri_specta::Event as _;
    crate::lifecycle::show_main(app);
    if let Err(error) = crate::ipc::PaletteOpen.emit_to(app, crate::lifecycle::MAIN) {
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
