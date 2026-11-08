//! Lists and controls regular running apps through `NSWorkspace` and `NSRunningApplication`.
//!
//! Both are thread-safe, so nothing here needs the main thread except the optional
//! `yieldActivationToApplication` hint in [`MacAppControl::activate`].

use std::path::Path;

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
        NSWorkspace::sharedWorkspace()
            .runningApplications()
            .iter()
            .filter(|app| is_regular(app))
            .map(|app| app_ref(&app))
            .collect()
    }

    fn hide(&self, pid: i32) -> Result<(), PlatformError> {
        let app = regular_app(pid)?;
        refused_unless(app.hide())
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
            #[allow(deprecated)]
            app.activateWithOptions(NSApplicationActivationOptions::ActivateAllWindows)
        };
        refused_unless(sent)
    }
}

/// Converts a running app into the core's [`AppRef`]; the name falls back to the bundle ID.
pub(crate) fn app_ref(app: &NSRunningApplication) -> AppRef {
    let pid = app.processIdentifier();
    let bundle_id = app.bundleIdentifier().map(|s| s.to_string());
    let name = app
        .localizedName()
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| bundle_id.clone())
        .unwrap_or_else(|| format!("pid {pid}"));
    AppRef {
        bundle_id,
        name,
        pid,
    }
}

fn is_regular(app: &NSRunningApplication) -> bool {
    app.activationPolicy() == NSApplicationActivationPolicy::Regular
}

/// The running regular app with this pid: `NotFound` when there is none, `Refused` when the
/// process is not a regular app (agents and background apps are never acted on).
fn regular_app(pid: i32) -> Result<Retained<NSRunningApplication>, PlatformError> {
    let app = NSRunningApplication::runningApplicationWithProcessIdentifier(pid)
        .ok_or(PlatformError::NotFound)?;
    if app.isTerminated() {
        return Err(PlatformError::NotFound);
    }
    if !is_regular(&app) {
        return Err(PlatformError::Refused);
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

/// `CFBundleIdentifier` from an `Info.plist`, or `None` when the file is missing or unreadable.
fn bundle_id_from_info_plist(path: &Path) -> Option<String> {
    let url = NSURL::from_file_path(path)?;
    // SAFETY: values are typed as `AnyObject`, which every plist value is, so the
    // dictionary's element types are correct.
    let plist =
        unsafe { NSDictionary::<NSString, AnyObject>::dictionaryWithContentsOfURL_error(&url) }
            .ok()?;
    let value = plist.objectForKey(&NSString::from_str("CFBundleIdentifier"))?;
    value.downcast::<NSString>().ok().map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn running_apps_contains_regular_apps() {
        let apps = MacAppControl.running_apps();
        assert!(!apps.is_empty());
        assert!(apps.iter().all(|a| !a.name.is_empty()));
    }

    #[test]
    fn running_apps_runs_off_main_thread() {
        let apps = std::thread::spawn(|| MacAppControl.running_apps())
            .join()
            .unwrap();
        assert!(!apps.is_empty());
    }

    #[test]
    fn hide_unknown_pid_is_not_found() {
        assert_eq!(MacAppControl.hide(i32::MAX), Err(PlatformError::NotFound));
        assert_eq!(
            MacAppControl.terminate(i32::MAX),
            Err(PlatformError::NotFound)
        );
        assert_eq!(
            MacAppControl.activate(i32::MAX),
            Err(PlatformError::NotFound)
        );
    }

    #[test]
    fn phone_bundle_id_missing_file_is_none() {
        assert_eq!(
            bundle_id_from_info_plist(Path::new("/nonexistent/Phone.app/Contents/Info.plist")),
            None
        );
    }

    #[test]
    fn bundle_id_is_read_from_an_existing_info_plist() {
        assert_eq!(
            bundle_id_from_info_plist(Path::new(
                "/System/Applications/Calculator.app/Contents/Info.plist"
            ))
            .as_deref(),
            Some("com.apple.calculator")
        );
    }
}
