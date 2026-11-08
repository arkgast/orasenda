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

    /// `Refused` when `-[NSRunningApplication hide]` returns NO. On macOS 27 it returns NO
    /// even when the app does hide (see `docs/common-issues.md`), so `Refused` here does not
    /// prove the app is still visible.
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
mod tests {
    use super::*;

    #[test]
    fn running_apps_contains_regular_apps() {
        let apps = MacAppControl.running_apps();
        assert!(!apps.is_empty());
        for app in &apps {
            assert!(!app.name.is_empty());
            assert_ne!(app.bundle_id.as_deref(), Some("com.apple.dock"));
            // An app that quit since the listing is skipped rather than failing the test.
            let Some(running) =
                NSRunningApplication::runningApplicationWithProcessIdentifier(app.pid)
            else {
                continue;
            };
            assert_eq!(
                running.activationPolicy(),
                NSApplicationActivationPolicy::Regular,
                "{} is not a regular app",
                app.name
            );
        }
    }

    #[test]
    fn hide_non_regular_app_is_not_a_regular_app() {
        let pid = NSWorkspace::sharedWorkspace()
            .runningApplications()
            .iter()
            .find(|app| !app.isTerminated() && !is_regular(app))
            .map(|app| app.processIdentifier())
            .expect("a running non-regular app");
        // The guard refuses before any AppKit action is attempted, with its own error, so it
        // is never confused with hide's unreliable NO (`Refused`).
        let not_regular = PlatformError::Other(NOT_REGULAR.into());
        assert_eq!(regular_app(pid).err(), Some(not_regular.clone()));
        assert_eq!(MacAppControl.hide(pid), Err(not_regular.clone()));
        assert_eq!(MacAppControl.terminate(pid), Err(not_regular));
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

    fn temp_plist(name: &str, contents: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "orasenda-platform-macos-{}-{name}.plist",
            std::process::id()
        ));
        std::fs::write(&path, contents).unwrap();
        path
    }

    #[test]
    fn read_bundle_id_missing_file_is_ok_none() {
        assert_eq!(
            read_bundle_id(Path::new("/nonexistent/Phone.app/Contents/Info.plist")),
            Ok(None)
        );
    }

    #[test]
    fn read_bundle_id_unparsable_file_is_an_error() {
        let path = temp_plist("garbage", "this is not a plist");
        let result = read_bundle_id(&path);
        std::fs::remove_file(&path).unwrap();
        assert!(result.is_err(), "{result:?}");
    }

    #[test]
    fn read_bundle_id_non_string_value_is_an_error() {
        let path = temp_plist(
            "integer",
            r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>CFBundleIdentifier</key><integer>42</integer></dict></plist>"#,
        );
        let result = read_bundle_id(&path);
        std::fs::remove_file(&path).unwrap();
        assert!(result.is_err(), "{result:?}");
    }
}
