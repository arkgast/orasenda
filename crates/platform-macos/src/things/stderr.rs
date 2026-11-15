//! Reads the reason out of `osascript`'s standard error.

use orasenda_core::platform::import::ThingsReadError;

/// Maps the error number osascript prints: -1743 (not allowed to automate Things) is
/// `Denied`; -600, -2700 or "can't find application" (Things is not there) is
/// `NotInstalled`; -1728 and anything else is `Failed` with the first line of the message.
pub fn error_from_stderr(stderr: &str) -> ThingsReadError {
    let lower = stderr.to_lowercase();
    if lower.contains("(-1743)") {
        ThingsReadError::Denied
    } else if lower.contains("(-600)")
        || lower.contains("(-2700)")
        || lower.contains("can't find application")
        || lower.contains("application can't be found")
    {
        ThingsReadError::NotInstalled
    } else {
        let line = stderr
            .lines()
            .find(|l| !l.trim().is_empty())
            .unwrap_or("osascript failed");
        ThingsReadError::Failed(line.trim().chars().take(300).collect())
    }
}
