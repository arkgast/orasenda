//! `review_get`: in the manifest and granted to the main window only.

use super::*;

#[test]
fn review_get_is_in_the_manifest_and_only_main_grants_it() {
    assert!(COMMANDS.contains(&"review_get"));
    let (_, main) = capability("main.json");
    assert!(main.iter().any(|p| p == "allow-review-get"));
    for file in ["overlay.json", "dev.json"] {
        let Some((_, other)) = std::fs::metadata(format!("capabilities/{file}"))
            .ok()
            .map(|_| capability(file))
        else {
            continue;
        };
        assert!(!other.iter().any(|p| p == "allow-review-get"), "{file}");
    }
}
