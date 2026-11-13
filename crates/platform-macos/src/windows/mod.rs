//! AppKit control for the Focus views (ADR-004, ADR-010, ADR-016): the displays, the
//! full-screen Focus window, the floating timer panel (the floater) and its keys.
//!
//! Every function needs the main thread and returns [`WindowError::NotOnMainThread`]
//! elsewhere, before it looks at a window pointer. `ns_window` is the pointer from Tauri's
//! `WebviewWindow::ns_window()`; the functions that take it are `unsafe fn` with the
//! `# Safety` contract of `overlay.rs`: null or a live `NSWindow` for the duration of the
//! call. Null is [`WindowError::NullWindow`]; an object that is not an `NSWindow` is
//! [`WindowError::NotAWindow`], refused before any window method runs. No lock is held
//! across an AppKit call.
//!
//! Frames are integer points relative to a display's top-left; AppKit's global bottom-left
//! coordinates never leave this module.

use std::ffi::c_void;
use std::fmt;

use objc2::MainThreadMarker;
use objc2::runtime::AnyObject;
use objc2_app_kit::NSWindow;
use orasenda_core::platform::PlatformError;

mod display_uuid;
mod displays;
mod floater;
mod focus_window;
mod keys;
#[cfg(test)]
mod tests;

pub use displays::{
    Display, Rect, ScreenObserver, display_key, displays, frame_of, observe_screen_changes,
    set_frame, to_appkit, to_top_left,
};
pub use floater::{configure_floater, key_without_activation};
pub use focus_window::configure_focus_window;
pub use keys::{FloaterKey, KeyMonitor, Modifiers, floater_key, install_floater_key_monitor};

/// Why a window operation did not happen. Unknown OS values map to a failure, never to a
/// silent success.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WindowError {
    NotOnMainThread,
    NullWindow,
    NotAWindow,
    /// No connected display has this key.
    UnknownDisplay(String),
    /// The panel class swap or another platform step failed.
    Platform(PlatformError),
}

impl fmt::Display for WindowError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotOnMainThread => f.write_str("not on main thread"),
            Self::NullWindow => f.write_str("null NSWindow pointer"),
            Self::NotAWindow => f.write_str("not an NSWindow"),
            Self::UnknownDisplay(key) => write!(f, "no display with key {key}"),
            Self::Platform(error) => write!(f, "{error:?}"),
        }
    }
}

impl std::error::Error for WindowError {}

pub(crate) fn main_thread() -> Result<MainThreadMarker, WindowError> {
    MainThreadMarker::new().ok_or(WindowError::NotOnMainThread)
}

/// The window behind `ns_window`. Only called after [`main_thread`] succeeded.
pub(crate) fn window<'a>(ns_window: *mut c_void) -> Result<&'a NSWindow, WindowError> {
    // SAFETY: the caller's `# Safety` contract: `ns_window` is null (handled by `as_ref`) or
    // points to a live Objective-C object for the duration of the public call that received
    // it. The reference does not outlive that call.
    let object =
        unsafe { ns_window.cast::<AnyObject>().as_ref() }.ok_or(WindowError::NullWindow)?;
    object
        .downcast_ref::<NSWindow>()
        .ok_or(WindowError::NotAWindow)
}
