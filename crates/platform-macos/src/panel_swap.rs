//! What the panel class swap (`overlay::swap_to_panel_class`) replaced, so a window gets its
//! own class back before it is torn down (#503, #504).
//!
//! AppKit and WebKit observe a Tauri window with KVO before it is made a panel, so its class is
//! then a KVO subclass (`NSKVONotifying_TaoWindow`). The swap takes that subclass out of the isa
//! chain, and KVO can no longer find those observers: when the window closes, removing them
//! throws `NSRangeException`, which unwinds into Rust and aborts the app. Putting the recorded
//! class back first lets every observer go as it came.

use std::sync::{Mutex, PoisonError};

use objc2::runtime::{AnyClass, AnyObject};
use orasenda_core::platform::PlatformError;

/// One swapped window: its address, the class it had and the panel class it got.
struct Swap {
    window: usize,
    before: &'static AnyClass,
    panel: &'static AnyClass,
}

/// The swapped windows that were not released yet. Touched on the main thread only (the swap
/// and the release both need it); the lock is never held across an AppKit call.
static SWAPS: Mutex<Vec<Swap>> = Mutex::new(Vec::new());

fn swaps() -> std::sync::MutexGuard<'static, Vec<Swap>> {
    SWAPS.lock().unwrap_or_else(PoisonError::into_inner)
}

fn address(window: &AnyObject) -> usize {
    std::ptr::from_ref(window) as usize
}

/// Remembers that `window` went from `before` to `panel`. A window destroyed without a release
/// (the app quitting) leaves its entry; a new window at that address replaces it here.
pub(crate) fn record(window: &AnyObject, before: &'static AnyClass, panel: &'static AnyClass) {
    let window = address(window);
    let mut swaps = swaps();
    swaps.retain(|swap| swap.window != window);
    swaps.push(Swap {
        window,
        before,
        panel,
    });
}

/// Gives `window` back the class it had before the swap. A window that was never swapped is
/// left as it is. When the class changed since the swap (an observer added later gave the panel
/// a KVO subclass of its own), putting the old class back would strand that observer instead,
/// so nothing changes and the failure is returned. Main thread only.
pub(crate) fn restore(window: &AnyObject) -> Result<(), PlatformError> {
    let at = address(window);
    let swap = {
        let mut swaps = swaps();
        let Some(index) = swaps.iter().position(|swap| swap.window == at) else {
            return Ok(());
        };
        swaps.remove(index)
    };
    let now = window.class();
    if !std::ptr::eq(now, swap.panel) {
        return Err(PlatformError::Other(format!(
            "the window's class changed since the panel swap ({}), so it was kept",
            now.name().to_string_lossy()
        )));
    }
    // SAFETY: this undoes `swap_to_panel_class` exactly: `swap.before` is the class this same
    // object had right before that swap, and its isa is still the panel class the swap set, so
    // nothing has changed the class since. Every invariant the swap relied on (same instance
    // size, `NSWindow` ivars at the same offsets, the bytes the old class added never touched by
    // the panel class) holds in reverse, and the old class's ivars were never moved. The caller
    // is on the main thread, so nothing changes the class concurrently.
    unsafe { AnyObject::set_class(window, swap.before) };
    Ok(())
}
