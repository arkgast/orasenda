//! Whether the process runs from an `.app` bundle.

use objc2_foundation::NSBundle;

/// `true` when the main bundle is an `.app` (a bundled build); `false` for a bare binary
/// such as `cargo test` or `tauri dev`, where `UNUserNotificationCenter` aborts the process.
pub fn is_app_bundle() -> bool {
    NSBundle::mainBundle()
        .bundleURL()
        .pathExtension()
        .is_some_and(|extension| extension.to_string() == "app")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_app_bundle_is_false_under_cargo_test() {
        assert!(!is_app_bundle());
    }
}
