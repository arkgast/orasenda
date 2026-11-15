//! The permission plists carry the keys macOS needs, checked as text so no plist crate is
//! needed and the test runs on every OS.

const INFO: &str = include_str!("../../Info.plist");
const ENTITLEMENTS: &str = include_str!("../../entitlements.plist");

/// The text after `<key>name</key>`, if the key is present.
fn after_key<'a>(plist: &'a str, name: &str) -> Option<&'a str> {
    let tag = format!("<key>{name}</key>");
    plist
        .find(&tag)
        .map(|at| plist[at + tag.len()..].trim_start())
}

/// The key is followed by a non-empty `<string>`.
fn has_string(plist: &str, name: &str) -> bool {
    after_key(plist, name)
        .and_then(|rest| rest.strip_prefix("<string>"))
        .and_then(|rest| rest.split_once("</string>"))
        .is_some_and(|(text, _)| !text.trim().is_empty())
}

/// The key is followed by `<true/>`.
fn has_true(plist: &str, name: &str) -> bool {
    after_key(plist, name).is_some_and(|rest| rest.starts_with("<true/>"))
}

#[test]
fn info_plist_has_reminders_key() {
    assert!(has_string(INFO, "NSRemindersFullAccessUsageDescription"));
}

#[test]
fn info_plist_has_apple_events_key() {
    assert!(has_string(INFO, "NSAppleEventsUsageDescription"));
}

#[test]
fn entitlements_plist_has_both_keys() {
    assert!(has_true(
        ENTITLEMENTS,
        "com.apple.security.automation.apple-events"
    ));
    assert!(has_true(
        ENTITLEMENTS,
        "com.apple.security.personal-information.calendars"
    ));
}

#[test]
fn checker_refuses_missing_and_empty_values() {
    assert!(!has_string("<key>A</key><string> </string>", "A"));
    assert!(!has_string("<key>A</key><true/>", "A"));
    assert!(!has_true("<key>A</key><false/>", "A"));
    assert!(!has_true("", "A"));
}
