//! Whether Orasenda is the active app (`NSApplication.isActive`), cached.
//!
//! "Active" means the app is frontmost, not that some window has focus: the non-activating
//! floater does not count. [`observe_activation`] seeds the cache and keeps it current from
//! `NSApplicationDidBecomeActive` and `NSApplicationDidResignActive`; [`is_active`] reads it
//! from any thread without touching AppKit.

use std::ptr::NonNull;
use std::sync::atomic::{AtomicBool, Ordering};

use block2::RcBlock;
use objc2_app_kit::{
    NSApplication, NSApplicationDidBecomeActiveNotification,
    NSApplicationDidResignActiveNotification,
};
use objc2_foundation::{NSNotification, NSNotificationCenter};

use crate::main_thread;

static ACTIVE: AtomicBool = AtomicBool::new(false);

/// The cached answer: false until [`observe_activation`] ran.
pub fn is_active() -> bool {
    ACTIVE.load(Ordering::SeqCst)
}

/// Seeds the cache from `NSApplication.isActive` and observes activation for the life of the
/// process. Main thread only: elsewhere it logs and leaves the cache false, which keeps the
/// two-minute notification on (the safe side: a missed note is worse than an extra one).
pub fn observe_activation() {
    let Ok(mtm) = main_thread() else {
        eprintln!("app_active: not on the main thread; the activation cache stays false");
        return;
    };
    ACTIVE.store(
        NSApplication::sharedApplication(mtm).isActive(),
        Ordering::SeqCst,
    );
    let center = NSNotificationCenter::defaultCenter();
    for (name, active) in [
        // SAFETY: extern statics from AppKit, initialized before any Rust code runs.
        (unsafe { NSApplicationDidBecomeActiveNotification }, true),
        (unsafe { NSApplicationDidResignActiveNotification }, false),
    ] {
        let block = RcBlock::new(move |_: NonNull<NSNotification>| {
            ACTIVE.store(active, Ordering::SeqCst);
        });
        // SAFETY: `obj` and `queue` are `None`, so the block runs on the posting thread (the
        // main thread for these); it captures only a `bool`. The center keeps the block alive,
        // so the returned token can be dropped.
        let _token = unsafe {
            center.addObserverForName_object_queue_usingBlock(Some(name), None, None, &block)
        };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_cache_starts_false_and_observing_off_the_main_thread_is_a_no_op() {
        assert!(!is_active());
        observe_activation();
        assert!(!is_active());
    }
}
