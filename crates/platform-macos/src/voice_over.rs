//! Whether VoiceOver is on (`NSWorkspace.isVoiceOverEnabled`) and a change observer.
//!
//! The keyboard service shows a hint in Settings when VoiceOver is on, because VoiceOver keys
//! can clash with a shortcut. [`observe_voice_over`] reports the state now and on every change
//! of the accessibility display options, for the life of the process.

use std::ptr::NonNull;

use block2::RcBlock;
use objc2_app_kit::{NSWorkspace, NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification};
use objc2_foundation::NSNotification;

use crate::main_thread;

/// Whether VoiceOver is running now. Safe on any thread.
pub fn is_voice_over_enabled() -> bool {
    NSWorkspace::sharedWorkspace().isVoiceOverEnabled()
}

/// Calls `sink` with the current state, then with the state after each change of the
/// accessibility display options. Main thread only: elsewhere it logs, calls nothing and
/// returns false (the caller keeps its default of "off").
pub fn observe_voice_over(sink: impl Fn(bool) + Send + Sync + 'static) -> bool {
    if main_thread().is_err() {
        eprintln!("voice_over: not on the main thread; VoiceOver is not observed");
        return false;
    }
    sink(is_voice_over_enabled());
    // The notification fires for every display option, so report only a change of VoiceOver.
    let last = std::sync::atomic::AtomicBool::new(is_voice_over_enabled());
    let center = NSWorkspace::sharedWorkspace().notificationCenter();
    let block = RcBlock::new(move |_: NonNull<NSNotification>| {
        let now = is_voice_over_enabled();
        if last.swap(now, std::sync::atomic::Ordering::SeqCst) != now {
            sink(now);
        }
    });
    // SAFETY: an extern static from AppKit, initialized before any Rust code runs. `obj` and
    // `queue` are `None`, so the block runs on the posting thread. The center keeps the block
    // alive, so the returned token can be dropped.
    let _token = unsafe {
        center.addObserverForName_object_queue_usingBlock(
            Some(NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification),
            None,
            None,
            &block,
        )
    };
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn observing_off_the_main_thread_calls_nothing() {
        let called = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let seen = called.clone();
        let observed = observe_voice_over(move |_| {
            seen.store(true, std::sync::atomic::Ordering::SeqCst);
        });
        assert!(!observed);
        assert!(!called.load(std::sync::atomic::Ordering::SeqCst));
    }

    #[test]
    fn the_state_can_be_read_from_any_thread() {
        let _ = is_voice_over_enabled();
    }
}
