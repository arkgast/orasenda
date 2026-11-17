//! `review_get`: in the manifest and granted to the main window only.

use super::*;

#[test]
fn review_get_is_in_the_manifest_and_only_main_grants_it() {
    assert!(COMMANDS.contains(&"review_get"));
    let (_, main) = capability("main.json");
    assert!(main.iter().any(|p| p == "allow-review-get"));
    for file in ["overlay.json", "dev.json", "floater.json", "capture.json"] {
        let (_, other) = capability(file);
        assert!(!other.iter().any(|p| p == "allow-review-get"), "{file}");
    }
}
