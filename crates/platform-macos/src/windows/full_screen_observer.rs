//! Observing native full screen on a window (ADR-019). Orasenda enters and leaves full screen
//! with Tauri's `set_fullscreen`; this module only reports what AppKit says happened:
//! did-enter and did-exit, from the window's notifications. Main thread only.
//!
//! AppKit reports a failed transition only through the window delegate
//! (`windowDidFailToEnterFullScreen:`), which Tauri owns, and posts no notification for it.
//! [`FullScreenEvent::DidFail`] therefore exists for the caller to raise when
//! `set_fullscreen` itself fails; a transition that fails silently ends by the caller's
//! timeout. This observer never raises it.

use std::ffi::c_void;
use std::ptr::NonNull;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2_app_kit::{
    NSWindowDidEnterFullScreenNotification, NSWindowDidExitFullScreenNotification,
};
use objc2_foundation::{NSNotification, NSNotificationCenter, NSObjectProtocol};

use super::{WindowError, main_thread, window};

/// What happened to a window's full-screen state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FullScreenEvent {
    DidEnter,
    DidExit,
    /// The transition did not happen. Raised by the caller; see the module notes.
    DidFail,
}

/// Keeps the observers registered; dropping it unregisters them.
#[must_use = "dropping it unregisters the observers"]
pub struct FullScreenObserver(Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>);

impl Drop for FullScreenObserver {
    fn drop(&mut self) {
        for token in &self.0 {
            // SAFETY: each token came from `addObserverForName:...` on this same center.
            unsafe { NSNotificationCenter::defaultCenter().removeObserver(token.as_ref()) };
        }
    }
}

/// Calls `callback` on each did-enter and did-exit of the window. It runs on the thread that
/// posts the notification, the main thread, so it must only record and schedule work. Main
/// thread only.
///
/// # Safety
///
/// `ns_window` must be null or point to a live `NSWindow` for the duration of the call. Null
/// and objects that are not an `NSWindow` are errors. The observers filter on the window object
/// and hold no reference to it.
pub unsafe fn observe_full_screen(
    ns_window: *mut c_void,
    callback: Box<dyn Fn(FullScreenEvent) + Send + Sync>,
) -> Result<FullScreenObserver, WindowError> {
    main_thread()?;
    let window = window(ns_window)?;
    let object: &AnyObject = window.as_ref();
    let callback = std::sync::Arc::new(callback);
    let center = NSNotificationCenter::defaultCenter();
    // SAFETY: both are static AppKit constants.
    let names = unsafe {
        [
            (
                NSWindowDidEnterFullScreenNotification,
                FullScreenEvent::DidEnter,
            ),
            (
                NSWindowDidExitFullScreenNotification,
                FullScreenEvent::DidExit,
            ),
        ]
    };
    let mut tokens = Vec::with_capacity(2);
    for (name, event) in names {
        let callback = std::sync::Arc::clone(&callback);
        let block = RcBlock::new(move |_: NonNull<NSNotification>| callback(event));
        // SAFETY: the block is copied by the center, and the token is kept in the returned
        // observer until it is dropped.
        let token = unsafe {
            center.addObserverForName_object_queue_usingBlock(
                Some(name),
                Some(object),
                None,
                &block,
            )
        };
        tokens.push(token);
    }
    Ok(FullScreenObserver(tokens))
}
