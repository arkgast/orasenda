//! The floater: a small always-on-top timer panel that takes keys without activating
//! Orasenda.

use std::ffi::c_void;

use objc2_app_kit::{
    NSFloatingWindowLevel, NSPanel, NSWindowCollectionBehavior, NSWindowStyleMask,
};

use objc2::runtime::AnyObject;
use orasenda_core::platform::PlatformError;

use super::{WindowError, main_thread, window};
use crate::overlay::swap_to_panel_class;

/// Makes the window the floater: its class becomes a key-capable `NSPanel` (the class swap
/// of the overlay), `nonactivatingPanel` joins the style mask, the level is
/// `NSFloatingWindowLevel`, the collection behavior is
/// `canJoinAllSpaces | fullScreenAuxiliary | stationary | ignoresCycle`, and
/// `hidesOnDeactivate` is NO (an `NSPanel` hides on deactivate by default). Main thread only.
///
/// # Safety
///
/// `ns_window` must be null or point to a live `NSWindow` (or subclass) object that stays
/// alive for the duration of the call. Null and objects that are not an `NSWindow` are
/// reported as errors, never dereferenced as a window. A dangling pointer is undefined
/// behavior. Calling off the main thread is an error, not UB: the pointer is not read
/// before the main-thread check.
pub unsafe fn configure_floater(ns_window: *mut c_void) -> Result<(), WindowError> {
    main_thread()?;
    let window = window(ns_window)?;
    swap_to_panel_class(window).map_err(WindowError::Platform)?;
    window.setStyleMask(window.styleMask() | NSWindowStyleMask::NonactivatingPanel);
    window.setLevel(NSFloatingWindowLevel);
    window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle,
    );
    // After the swap the object is an `NSPanel`; refuse rather than assume.
    let object: &AnyObject = window.as_ref();
    let panel = object
        .downcast_ref::<NSPanel>()
        .ok_or_else(|| WindowError::Platform(PlatformError::Other("not an NSPanel".into())))?;
    panel.setHidesOnDeactivate(false);
    Ok(())
}

/// Brings the window to the front and makes it key, without activating Orasenda
/// (`orderFrontRegardless`, then `makeKeyWindow`). Main thread only.
///
/// # Safety
///
/// Same contract as [`configure_floater`].
pub unsafe fn key_without_activation(ns_window: *mut c_void) -> Result<(), WindowError> {
    main_thread()?;
    let window = window(ns_window)?;
    window.orderFrontRegardless();
    window.makeKeyWindow();
    Ok(())
}

/// Gives a window made into a panel (floater or capture) its own class back. Call it on the
/// main thread right before the window closes: AppKit and WebKit observed it with KVO before the
/// swap, and tearing it down as a panel throws `NSRangeException` from their observer removal,
/// which aborts the app (#503, #504). A window that was never swapped is left as it is; one
/// whose class changed since the swap is refused (`Platform`) and left as it is. Main thread only.
///
/// # Safety
///
/// Same contract as [`configure_floater`].
pub unsafe fn release_panel(ns_window: *mut c_void) -> Result<(), WindowError> {
    main_thread()?;
    let window = window(ns_window)?;
    crate::panel_swap::restore(window.as_ref()).map_err(WindowError::Platform)
}
