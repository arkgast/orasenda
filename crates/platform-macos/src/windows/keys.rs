//! The floater's keys. While the non-activating floater is key and Orasenda is not the
//! active app, the app menu may not see key equivalents (spec Open question 1), so a local
//! `NSEvent` monitor is the fallback. It is built and tested here; whether it is installed
//! is the windows module's decision.

use std::ffi::c_void;
use std::ptr::{NonNull, null_mut};

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags};

use super::{WindowError, main_thread, window};

/// The modifier keys that matter to the floater. Caps lock, fn and the rest are ignored by
/// [`Modifiers::from_flags`].
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Modifiers {
    pub shift: bool,
    pub command: bool,
    pub option: bool,
    pub control: bool,
}

impl Modifiers {
    fn from_flags(flags: NSEventModifierFlags) -> Self {
        Self {
            shift: flags.contains(NSEventModifierFlags::Shift),
            command: flags.contains(NSEventModifierFlags::Command),
            option: flags.contains(NSEventModifierFlags::Option),
            control: flags.contains(NSEventModifierFlags::Control),
        }
    }
}

/// What a floater key press means.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FloaterKey {
    Space,
    Return,
    Escape,
    /// Shift-Command-F.
    FullScreen,
    /// Shift-Command-T.
    FloatingTimer,
    /// Command-K.
    Commands,
}

/// The floater key for a virtual key code and modifier set: Space, Return and Escape with no
/// modifier, Shift-Command-F, Shift-Command-T and Command-K. Anything else is `None`.
pub fn floater_key(key_code: u16, modifiers: Modifiers) -> Option<FloaterKey> {
    let Modifiers {
        shift,
        command,
        option,
        control,
    } = modifiers;
    if option || control {
        return None;
    }
    match (key_code, shift, command) {
        (49, false, false) => Some(FloaterKey::Space),
        (36, false, false) => Some(FloaterKey::Return),
        (53, false, false) => Some(FloaterKey::Escape),
        (3, true, true) => Some(FloaterKey::FullScreen),
        (17, true, true) => Some(FloaterKey::FloatingTimer),
        (40, false, true) => Some(FloaterKey::Commands),
        _ => None,
    }
}

/// An installed key monitor; dropping it removes the monitor.
pub struct KeyMonitor(Retained<AnyObject>);

impl Drop for KeyMonitor {
    fn drop(&mut self) {
        // SAFETY: the object came from `addLocalMonitorForEventsMatchingMask:handler:`.
        unsafe { NSEvent::removeMonitor(&self.0) };
    }
}

/// Installs a local key-down monitor for the floater. A key press is passed to `handler`
/// only when it is one of the six [`FloaterKey`]s and the event is for this window and the
/// window is key; the event is consumed only when `handler` returns true, otherwise it goes
/// on to the responder chain. Main thread only; `handler` runs on it.
///
/// # Safety
///
/// `ns_window` must be null or point to a live `NSWindow` (or subclass) object for the
/// duration of the call (the contract of `overlay.rs`). The monitor keeps only the pointer's
/// address, compared with each event's window and never dereferenced, so it cannot dangle.
pub unsafe fn install_floater_key_monitor(
    ns_window: *mut c_void,
    handler: Box<dyn Fn(FloaterKey) -> bool>,
) -> Result<KeyMonitor, WindowError> {
    let mtm = main_thread()?;
    window(ns_window)?;
    let address = ns_window as usize;
    let block = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        // SAFETY: AppKit passes a live event for the duration of the handler.
        let event_ref = unsafe { event.as_ref() };
        let ours = event_ref.window(mtm).is_some_and(|w| {
            std::ptr::from_ref::<AnyObject>(w.as_ref()) as usize == address && w.isKeyWindow()
        });
        let key = floater_key(
            event_ref.keyCode(),
            Modifiers::from_flags(event_ref.modifierFlags()),
        );
        match key {
            Some(key) if ours && handler(key) => null_mut(),
            _ => event.as_ptr(),
        }
    });
    // SAFETY: the block is copied by AppKit; the monitor object is kept until removed.
    let monitor = unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &block)
    }
    .ok_or(WindowError::NotAWindow)?;
    Ok(KeyMonitor(monitor))
}
