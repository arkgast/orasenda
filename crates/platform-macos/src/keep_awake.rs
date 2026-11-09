//! Keeps App Nap from delaying a running session, through an `NSProcessInfo` activity.

use std::any::Any;

use objc2::rc::Retained;
use objc2::runtime::{NSObjectProtocol, ProtocolObject};
use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};
use orasenda_core::platform::{KeepAwake, PlatformError};

/// Begins a user-initiated `NSProcessInfo` activity that still allows idle system sleep.
/// Needs no permission and shows no prompt.
#[derive(Debug, Default, Clone, Copy)]
pub struct MacKeepAwake;

/// The activity from [`MacKeepAwake::begin`]; dropping it ends the activity.
pub struct ActivityToken(Retained<ProtocolObject<dyn NSObjectProtocol>>);

// SAFETY: the token is opaque; it is only ever passed to `-[NSProcessInfo endActivity:]`
// (in `Drop`), which is thread-safe, so moving it to another thread is sound.
unsafe impl Send for ActivityToken {}

impl Drop for ActivityToken {
    fn drop(&mut self) {
        // SAFETY: `self.0` is the object `beginActivityWithOptions:reason:` returned, the
        // only type `endActivity:` accepts, and it is ended exactly once, here.
        unsafe { NSProcessInfo::processInfo().endActivity(&self.0) };
    }
}

impl KeepAwake for MacKeepAwake {
    fn begin(&self, reason: &str) -> Result<Box<dyn Any + Send>, PlatformError> {
        let activity = NSProcessInfo::processInfo().beginActivityWithOptions_reason(
            NSActivityOptions::UserInitiatedAllowingIdleSystemSleep,
            &NSString::from_str(reason),
        );
        Ok(Box::new(ActivityToken(activity)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_send<T: Send>() {}

    #[test]
    fn activity_token_is_send() {
        assert_send::<ActivityToken>();
    }

    #[test]
    fn keep_awake_begins_and_ends() {
        let token = MacKeepAwake
            .begin("Focus session")
            .expect("activity begins");
        assert!(token.is::<ActivityToken>());
        // The service drops the token on another thread; `Drop` ends the activity there.
        std::thread::spawn(move || drop(token)).join().unwrap();
    }
}
