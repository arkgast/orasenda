//! The full-screen Focus window: an ordinary-level window that fills one display.

use std::ffi::c_void;

use objc2_app_kit::{NSNormalWindowLevel, NSWindowCollectionBehavior};

use super::displays::screen_with_key;
use super::{WindowError, main_thread, window};

/// Frames the window to the whole `frame` of the display with key `display_id` (AppKit
/// coordinates, as `cover_main_screen` does), at `NSNormalWindowLevel`, with
/// `fullScreenAuxiliary | moveToActiveSpace`: it opens on the Space the user is on and may
/// sit beside a full-screen app. Main thread only; `UnknownDisplay` when the display is gone.
///
/// # Safety
///
/// `ns_window` must be null or point to a live `NSWindow` (or subclass) object that stays
/// alive for the duration of the call. Null and objects that are not an `NSWindow` are
/// reported as errors, never dereferenced as a window. A dangling pointer is undefined
/// behavior. Calling off the main thread is an error, not UB: the pointer is not read
/// before the main-thread check.
pub unsafe fn configure_focus_window(
    ns_window: *mut c_void,
    display_id: &str,
) -> Result<(), WindowError> {
    let mtm = main_thread()?;
    let window = window(ns_window)?;
    let screen = screen_with_key(mtm, display_id)?;
    window.setLevel(NSNormalWindowLevel);
    window.setCollectionBehavior(
        NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::MoveToActiveSpace,
    );
    window.setFrame_display(screen.frame(), true);
    Ok(())
}
