//! The main window's minimum size is the design tokens' `window-min-*`: one number, two files.

use std::path::Path;

use serde_json::Value;

fn read_json(relative: &str) -> Value {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(relative);
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

/// A token's px value, such as `"360px"` as 360.
fn size_token(tokens: &Value, name: &str) -> f64 {
    let entry = tokens["size"]["tokens"]
        .as_array()
        .expect("tokens.json size.tokens")
        .iter()
        .find(|t| t["name"] == name)
        .unwrap_or_else(|| panic!("token {name}"));
    let value = entry["value"].as_str().expect("token value");
    value
        .strip_suffix("px")
        .unwrap_or_else(|| panic!("{name} is not px: {value}"))
        .parse()
        .unwrap_or_else(|e| panic!("{name}: {e}"))
}

#[test]
fn window_minimum_equals_tokens() {
    let conf = read_json("tauri.conf.json");
    let tokens = read_json("../../../packages/tokens/tokens.json");
    let main = conf["app"]["windows"]
        .as_array()
        .expect("windows")
        .iter()
        .find(|w| w["label"] == "main")
        .expect("main window entry");
    assert_eq!(
        main["minWidth"].as_f64(),
        Some(size_token(&tokens, "window-min-width"))
    );
    assert_eq!(
        main["minHeight"].as_f64(),
        Some(size_token(&tokens, "window-min-height"))
    );
}
