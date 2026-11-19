//! Lists and controls regular running apps through `NSWorkspace` and `NSRunningApplication`.
//!
//! Both are thread-safe, so nothing here needs the main thread except the optional
//! `yieldActivationToApplication` hint in [`MacAppControl::activate`].

use std::path::Path;
use std::thread;
use std::time::{Duration, Instant};

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{MainThreadMarker, available};
use objc2_app_kit::{
    NSApplication, NSApplicationActivationOptions, NSApplicationActivationPolicy,
    NSRunningApplication, NSWorkspace,
};
use objc2_foundation::{NSDictionary, NSString, NSURL};
use orasenda_core::blocking::AppRef;
use orasenda_core::platform::{AppControl, PlatformError};

/// Controls regular (Dock-visible) apps. Never force-quits.
#[derive(Debug, Default, Clone, Copy)]
pub struct MacAppControl;

impl AppControl for MacAppControl {
    fn running_apps(&self) -> Vec<AppRef> {
        regular_apps(
            NSWorkspace::sharedWorkspace()
                .runningApplications()
                .iter()
                .map(|app| snapshot(&app)),
        )
    }

    /// `Refused` when `-[NSRunningApplication hide]` returns NO. On macOS 27 it returns NO
    /// even when the app does hide (see `docs/common-issues.md`), so `Refused` here does not
    /// prove the app is still visible.
    ///
    /// An app that already reports hidden can still be on screen: Mission Control switches
    /// to a hidden full-screen app's Space and activates it without unhiding it, and a plain
    /// `hide` is then a no-op that leaves the user on that Space (#56). Such an app is
    /// unhidden and hidden again on thread `hide-again`, which waits for the unhide to land
    /// (an immediate `hide` is dropped). That needs the main run loop to turn, so it cannot
    /// wait here; this returns `Ok` once the thread is started, and the thread logs when the
    /// unhide never lands. Back to focus clicked again within about 1 s, while a `hide-again`
    /// thread still runs, can leave the app visible but inactive; the next Back to focus
    /// hides it.
    fn hide(&self, pid: i32) -> Result<(), PlatformError> {
        let app = regular_app(pid)?;
        if !app.isHidden() {
            return refused_unless(app.hide());
        }
        eprintln!(
            "platform-macos: {} already hidden, re-hiding on thread hide-again",
            app_ref(&app).name
        );
        thread::Builder::new()
            .name("hide-again".into())
            .spawn(move || {
                if hide_again(&*app, UNHIDE_POLL, UNHIDE_TIMEOUT) {
                    let name = app_ref(&app).name;
                    eprintln!(
                        "platform-macos: re-hide of {name}: the unhide did not land within {} s; hide sent anyway",
                        UNHIDE_TIMEOUT.as_secs()
                    );
                }
            })
            .map(drop)
            .map_err(|error| PlatformError::Other(format!("could not start hide-again: {error}")))
    }

    fn terminate(&self, pid: i32) -> Result<(), PlatformError> {
        let app = regular_app(pid)?;
        refused_unless(app.terminate())
    }

    fn activate(&self, pid: i32) -> Result<(), PlatformError> {
        let app = regular_app(pid)?;
        let sent = if available!(macos = 14.0) {
            // Cooperative activation: the active app (us, when we are in front) yields first.
            // `NSApplication` is main-thread only, so off the main thread we skip the hint.
            if let Some(mtm) = MainThreadMarker::new() {
                NSApplication::sharedApplication(mtm).yieldActivationToApplication(&app);
            }
            app.activateFromApplication_options(
                &NSRunningApplication::currentApplication(),
                NSApplicationActivationOptions::empty(),
            )
        } else {
            #[allow(deprecated)] // Deprecated in macOS 14; this branch only runs before 14.
            app.activateWithOptions(NSApplicationActivationOptions::ActivateAllWindows)
        };
        refused_unless(sent)
    }
}

/// How often [`hide_again`] checks whether the unhide landed.
const UNHIDE_POLL: Duration = Duration::from_millis(10);
/// How long [`hide_again`] waits for the unhide before hiding anyway (it lands in ~10 ms).
const UNHIDE_TIMEOUT: Duration = Duration::from_secs(1);

/// The `NSRunningApplication` calls [`hide_again`] makes, so their order is testable.
trait Hideable {
    fn is_hidden(&self) -> bool;
    fn unhide(&self) -> bool;
    fn hide(&self) -> bool;
}

impl Hideable for NSRunningApplication {
    fn is_hidden(&self) -> bool {
        self.isHidden()
    }
    fn unhide(&self) -> bool {
        NSRunningApplication::unhide(self)
    }
    fn hide(&self) -> bool {
        NSRunningApplication::hide(self)
    }
}

/// Unhides `app`, waits (polling every `poll`, at most `timeout`) until it no longer
/// reports hidden, then hides it, so the app goes through a real hide. Returns whether it
/// timed out (the app still reported hidden, so the `hide` was likely a no-op). Both BOOLs
/// are unreliable on macOS 27 and are ignored. Blocks: never call it on the main thread.
fn hide_again(app: &impl Hideable, poll: Duration, timeout: Duration) -> bool {
    app.unhide();
    let start = Instant::now();
    let mut hidden = app.is_hidden();
    while hidden && start.elapsed() < timeout {
        thread::sleep(poll);
        hidden = app.is_hidden();
    }
    app.hide();
    hidden
}

/// What [`regular_apps`] and [`to_app_ref`] need from a running app, read once so the
/// filtering and naming can be tested without launchservicesd.
struct AppSnapshot {
    pid: i32,
    name: Option<String>,
    bundle_id: Option<String>,
    policy: NSApplicationActivationPolicy,
}

fn snapshot(app: &NSRunningApplication) -> AppSnapshot {
    AppSnapshot {
        pid: app.processIdentifier(),
        name: app.localizedName().map(|s| s.to_string()),
        bundle_id: app.bundleIdentifier().map(|s| s.to_string()),
        policy: app.activationPolicy(),
    }
}

/// The regular apps among `apps`, in order. Empty when none is regular, which launchservicesd
/// sometimes reports to a new process.
fn regular_apps(apps: impl IntoIterator<Item = AppSnapshot>) -> Vec<AppRef> {
    apps.into_iter()
        .filter(|app| app.policy == NSApplicationActivationPolicy::Regular)
        .map(to_app_ref)
        .collect()
}

/// Converts a running app into the core's [`AppRef`]; the name falls back to the bundle ID.
pub(crate) fn app_ref(app: &NSRunningApplication) -> AppRef {
    to_app_ref(snapshot(app))
}

/// The name is the localized name, else the bundle ID, else `pid <n>`.
fn to_app_ref(app: AppSnapshot) -> AppRef {
    let name = app
        .name
        .filter(|s| !s.is_empty())
        .or_else(|| app.bundle_id.clone())
        .unwrap_or_else(|| format!("pid {}", app.pid));
    AppRef {
        bundle_id: app.bundle_id,
        name,
        pid: app.pid,
    }
}

fn is_regular(app: &NSRunningApplication) -> bool {
    app.activationPolicy() == NSApplicationActivationPolicy::Regular
}

/// Why [`regular_app`] turned a pid down: it is not a regular app.
const NOT_REGULAR: &str = "not a regular app";

/// The running regular app with this pid: `NotFound` when there is none,
/// `Other("not a regular app")` when the process is not a regular app (agents and background
/// apps are never acted on). Not `Refused`, which `hide` gives for AppKit's unreliable NO.
fn regular_app(pid: i32) -> Result<Retained<NSRunningApplication>, PlatformError> {
    let app = NSRunningApplication::runningApplicationWithProcessIdentifier(pid)
        .ok_or(PlatformError::NotFound)?;
    if app.isTerminated() {
        return Err(PlatformError::NotFound);
    }
    if !is_regular(&app) {
        return Err(PlatformError::Other(NOT_REGULAR.into()));
    }
    Ok(app)
}

fn refused_unless(sent: bool) -> Result<(), PlatformError> {
    if sent {
        Ok(())
    } else {
        Err(PlatformError::Refused)
    }
}

const PHONE_INFO_PLIST: &str = "/System/Applications/Phone.app/Contents/Info.plist";

/// The bundle ID of the system Phone app, or `None` when this macOS has none.
pub fn phone_bundle_id() -> Option<String> {
    bundle_id_from_info_plist(Path::new(PHONE_INFO_PLIST))
}

/// `CFBundleIdentifier` from an `Info.plist`, or `None` when the file is missing. A file that
/// exists but cannot be read, or has no string `CFBundleIdentifier`, is logged and gives `None`.
fn bundle_id_from_info_plist(path: &Path) -> Option<String> {
    read_bundle_id(path).unwrap_or_else(|reason| {
        eprintln!("platform-macos: {}: {reason}", path.display());
        None
    })
}

/// `Ok(None)` when `path` does not exist; `Err` with the reason when it exists but is
/// unreadable, is not a plist dictionary, or its `CFBundleIdentifier` is missing or not a string.
fn read_bundle_id(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let url = NSURL::from_file_path(path).ok_or("not a file path")?;
    // SAFETY: values are typed as `AnyObject`, which every plist value is, so the
    // dictionary's element types are correct.
    let plist =
        unsafe { NSDictionary::<NSString, AnyObject>::dictionaryWithContentsOfURL_error(&url) }
            .map_err(|err| format!("cannot read plist: {}", err.localizedDescription()))?;
    let value = plist
        .objectForKey(&NSString::from_str("CFBundleIdentifier"))
        .ok_or("no CFBundleIdentifier")?;
    let id = value
        .downcast::<NSString>()
        .map_err(|_| "CFBundleIdentifier is not a string")?;
    Ok(Some(id.to_string()))
}

#[cfg(test)]
mod tests;
