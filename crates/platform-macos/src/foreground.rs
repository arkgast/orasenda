//! Frontmost app and activation/termination observers via `NSWorkspace`.

use std::ptr::NonNull;

use block2::RcBlock;
use objc2::MainThreadMarker;
use objc2::rc::Retained;
use objc2_app_kit::{
    NSRunningApplication, NSWorkspace, NSWorkspaceApplicationKey,
    NSWorkspaceDidActivateApplicationNotification, NSWorkspaceDidTerminateApplicationNotification,
};
use objc2_foundation::{NSNotification, NSNotificationName};
use orasenda_core::blocking::AppRef;
use orasenda_core::platform::{ForegroundSource, PlatformError};

use crate::{control::app_ref, main_thread};

/// Reports the frontmost app and its changes.
///
/// Observers registered by [`ForegroundSource::subscribe`] and
/// [`MacForeground::subscribe_terminations`] stay for the life of the process.
#[derive(Debug, Default, Clone, Copy)]
pub struct MacForeground;

impl MacForeground {
    pub fn new() -> MacForeground {
        MacForeground
    }

    /// Calls `sink` with the pid of every app that quits. Main thread only: elsewhere it
    /// returns `Other("not on main thread")`.
    pub fn subscribe_terminations(
        &self,
        sink: Box<dyn Fn(i32) + Send + Sync>,
    ) -> Result<(), PlatformError> {
        let mtm = main_thread()?;
        // SAFETY: an extern static from AppKit, initialized before any Rust code runs.
        let name = unsafe { NSWorkspaceDidTerminateApplicationNotification };
        observe(mtm, name, move |app| sink(app.processIdentifier()));
        Ok(())
    }
}

impl ForegroundSource for MacForeground {
    fn frontmost(&self) -> Option<AppRef> {
        NSWorkspace::sharedWorkspace()
            .frontmostApplication()
            .map(|app| app_ref(&app))
    }

    /// Main thread only: elsewhere it returns `Other("not on main thread")`.
    fn subscribe(&self, sink: Box<dyn Fn(AppRef) + Send + Sync>) -> Result<(), PlatformError> {
        let mtm = main_thread()?;
        // SAFETY: an extern static from AppKit, initialized before any Rust code runs.
        let name = unsafe { NSWorkspaceDidActivateApplicationNotification };
        observe(mtm, name, move |app| sink(app_ref(&app)));
        Ok(())
    }
}

/// Registers `handler` for the `NSWorkspace` notification `name`, passing the app from its
/// user info. Requires the main thread, proven by `_mtm`.
fn observe(
    _mtm: MainThreadMarker,
    name: &NSNotificationName,
    handler: impl Fn(Retained<NSRunningApplication>) + Send + Sync + 'static,
) {
    let block = RcBlock::new(move |notification: NonNull<NSNotification>| {
        // SAFETY: AppKit passes a valid notification that lives for the block call.
        let notification = unsafe { notification.as_ref() };
        if let Some(app) = notification_app(notification) {
            handler(app);
        }
    });
    let center = NSWorkspace::sharedWorkspace().notificationCenter();
    // SAFETY: `obj` and `queue` are `None`, so the block runs on the posting thread (AppKit
    // posts workspace notifications on the main thread); the block only captures a
    // `Send + Sync` handler, so it is sendable. The center keeps the block alive, so the
    // returned token can be dropped.
    let _token = unsafe {
        center.addObserverForName_object_queue_usingBlock(Some(name), None, None, &block)
    };
}

fn notification_app(notification: &NSNotification) -> Option<Retained<NSRunningApplication>> {
    let info = notification.userInfo()?;
    // SAFETY: an extern static from AppKit, initialized before any Rust code runs.
    let key = unsafe { NSWorkspaceApplicationKey };
    info.objectForKey(key)?
        .downcast::<NSRunningApplication>()
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn not_on_main_thread() -> PlatformError {
        PlatformError::Other("not on main thread".into())
    }

    #[test]
    fn subscribe_off_main_thread_errors() {
        let fg = MacForeground::new();
        assert_eq!(fg.subscribe(Box::new(|_| {})), Err(not_on_main_thread()));
        assert_eq!(
            fg.subscribe_terminations(Box::new(|_| {})),
            Err(not_on_main_thread())
        );
    }

    #[test]
    #[ignore = "needs a GUI session; run by hand"]
    fn frontmost_returns_some() {
        assert!(MacForeground::new().frontmost().is_some());
    }
}
