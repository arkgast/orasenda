use super::*;

fn fake(
    pid: i32,
    name: Option<&str>,
    bundle_id: Option<&str>,
    policy: NSApplicationActivationPolicy,
) -> AppSnapshot {
    AppSnapshot {
        pid,
        name: name.map(Into::into),
        bundle_id: bundle_id.map(Into::into),
        policy,
    }
}

#[test]
fn regular_apps_without_regular_entries_is_empty() {
    // launchservicesd can report only Accessory and Prohibited apps to a new process.
    let apps = [
        fake(
            1,
            Some("Dock"),
            Some("com.apple.dock"),
            NSApplicationActivationPolicy::Accessory,
        ),
        fake(
            2,
            Some("loginwindow"),
            None,
            NSApplicationActivationPolicy::Prohibited,
        ),
    ];
    assert_eq!(regular_apps(apps), []);
}

#[test]
fn regular_apps_keeps_only_regular_in_order() {
    let apps = [
        fake(
            3,
            Some("Notes"),
            Some("com.apple.Notes"),
            NSApplicationActivationPolicy::Regular,
        ),
        fake(
            1,
            Some("Dock"),
            Some("com.apple.dock"),
            NSApplicationActivationPolicy::Accessory,
        ),
        fake(
            2,
            Some("Safari"),
            Some("com.apple.Safari"),
            NSApplicationActivationPolicy::Regular,
        ),
        fake(4, None, None, NSApplicationActivationPolicy::Prohibited),
    ];
    let pids: Vec<i32> = regular_apps(apps).iter().map(|app| app.pid).collect();
    assert_eq!(pids, [3, 2]);
}

#[test]
fn app_name_prefers_localized_name() {
    let app = fake(
        7,
        Some("Safari"),
        Some("com.apple.Safari"),
        NSApplicationActivationPolicy::Regular,
    );
    assert_eq!(
        to_app_ref(app),
        AppRef {
            bundle_id: Some("com.apple.Safari".into()),
            name: "Safari".into(),
            pid: 7,
        }
    );
}

#[test]
fn app_name_falls_back_to_bundle_id_when_name_missing_or_empty() {
    for name in [None, Some("")] {
        let app = fake(
            7,
            name,
            Some("com.example.App"),
            NSApplicationActivationPolicy::Regular,
        );
        assert_eq!(to_app_ref(app).name, "com.example.App");
    }
}

#[test]
fn app_name_falls_back_to_pid() {
    let app = fake(42, None, None, NSApplicationActivationPolicy::Regular);
    assert_eq!(
        to_app_ref(app),
        AppRef {
            bundle_id: None,
            name: "pid 42".into(),
            pid: 42,
        }
    );
}

/// The live list from the test thread and from a spawned one (NSWorkspace is thread-safe).
fn live_lists() -> [Vec<AppRef>; 2] {
    let off_main = std::thread::spawn(|| MacAppControl.running_apps())
        .join()
        .unwrap();
    [MacAppControl.running_apps(), off_main]
}

/// Holds for any list launchservicesd reports, including an empty one, so the default run
/// never depends on which apps it reports. The non-empty check is the ignored live test.
#[test]
fn running_apps_holds_only_named_regular_apps() {
    for app in live_lists().iter().flatten() {
        assert!(!app.name.is_empty());
        assert_ne!(app.bundle_id.as_deref(), Some("com.apple.dock"));
        // An app that quit since the listing is skipped rather than failing the test.
        let Some(running) = NSRunningApplication::runningApplicationWithProcessIdentifier(app.pid)
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

/// launchservicesd sometimes reports no Regular apps to a new process (seen 2026-11-18
/// and 2026-11-19, cause outside this crate), so this runs only on demand.
#[test]
#[ignore = "needs launchservicesd to report Regular apps; run with just live-macos"]
fn live_running_apps_lists_regular_apps() {
    let [on_test_thread, off_main] = live_lists();
    let counts = policy_counts();
    assert!(
        !on_test_thread.is_empty(),
        "no regular apps on the test thread; {counts}"
    );
    assert!(
        !off_main.is_empty(),
        "no regular apps off the main thread; {counts}"
    );
}

/// The live list's size by activation policy, for the live test's failure message.
fn policy_counts() -> String {
    let apps = NSWorkspace::sharedWorkspace().runningApplications();
    let count = |policy| {
        apps.iter()
            .filter(|app| app.activationPolicy() == policy)
            .count()
    };
    format!(
        "launchservicesd reports {} apps: {} regular, {} accessory, {} prohibited",
        apps.len(),
        count(NSApplicationActivationPolicy::Regular),
        count(NSApplicationActivationPolicy::Accessory),
        count(NSApplicationActivationPolicy::Prohibited),
    )
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

/// Records the calls [`hide_again`] makes. It stops reporting hidden after `unhide`
/// once `hidden_checks_after_unhide` more checks have run (never when `None`).
struct FakeApp {
    hidden_checks_after_unhide: Option<usize>,
    calls: std::cell::RefCell<Vec<&'static str>>,
}

impl FakeApp {
    fn new(hidden_checks_after_unhide: Option<usize>) -> FakeApp {
        FakeApp {
            hidden_checks_after_unhide,
            calls: Default::default(),
        }
    }
    fn calls(&self) -> Vec<&'static str> {
        self.calls.borrow().clone()
    }
}

impl Hideable for FakeApp {
    fn is_hidden(&self) -> bool {
        let mut calls = self.calls.borrow_mut();
        let checks = calls.iter().filter(|call| **call == "is_hidden").count();
        calls.push("is_hidden");
        match self.hidden_checks_after_unhide {
            Some(limit) if calls.contains(&"unhide") => checks < limit,
            _ => true,
        }
    }
    fn unhide(&self) -> bool {
        self.calls.borrow_mut().push("unhide");
        false
    }
    fn hide(&self) -> bool {
        self.calls.borrow_mut().push("hide");
        false
    }
}

#[test]
fn hide_again_hides_only_once_the_unhide_landed() {
    // Mission Control can show and activate a hidden full-screen app without unhiding
    // it; a plain `hide` is then a no-op and you stay on its Space (#56). A `hide` sent
    // right after `unhide` is dropped too, so it waits for the unhide.
    let app = FakeApp::new(Some(2));
    assert!(!hide_again(&app, Duration::ZERO, Duration::from_secs(5)));
    assert_eq!(
        app.calls(),
        ["unhide", "is_hidden", "is_hidden", "is_hidden", "hide"]
    );
}

#[test]
fn hide_again_hides_anyway_after_the_timeout() {
    let app = FakeApp::new(None);
    assert!(hide_again(
        &app,
        Duration::from_millis(1),
        Duration::from_millis(20)
    ));
    let calls = app.calls();
    assert_eq!(calls.first(), Some(&"unhide"));
    assert_eq!(calls.last(), Some(&"hide"));
    assert!(calls.iter().filter(|call| **call == "is_hidden").count() >= 2);
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
