//! The two system-key lists match the spec exactly.

use super::Accelerator;
use super::system_keys::{NEVER_DELIVERED, WELL_KNOWN, never_delivered, well_known};

const KEPT: &str = "macOS keeps this key, so it won't reach Orasenda.";

fn acc(text: &str) -> Accelerator {
    Accelerator::parse(text).expect("parses")
}

#[test]
fn never_delivered_list_exact() {
    let glyphs: Vec<&str> = NEVER_DELIVERED.iter().map(|(_, g)| *g).collect();
    assert_eq!(
        glyphs,
        [
            "⌘Tab",
            "⇧⌘Tab",
            "⌘Space",
            "⌃Space",
            "⌥⌘Esc",
            "⌃⌘Q",
            "⇧⌘3",
            "⇧⌘4",
            "⇧⌘5",
            "⌃↑",
            "⌃↓",
            "⌃←",
            "⌃→"
        ]
    );
    // Every entry the grammar can express is refused with the plain line, and shows its glyphs.
    for (keys, glyph) in NEVER_DELIVERED {
        let Ok(parsed) = Accelerator::parse(keys) else {
            assert!(keys.ends_with("Escape"), "{keys} should parse");
            continue;
        };
        assert_eq!(never_delivered(&parsed), Some(KEPT), "{keys}");
        assert_eq!(parsed.describe(), *glyph);
    }
    assert_eq!(never_delivered(&acc("Super+KeyK")), None);
}

#[test]
fn well_known_list_exact() {
    let glyphs: Vec<&str> = WELL_KNOWN.iter().map(|(_, g, _)| *g).collect();
    assert_eq!(
        glyphs,
        [
            "⌘Q",
            "⌘W",
            "⌘H",
            "⌘M",
            "⌘F",
            "⌘T",
            "⇧⌘T",
            "⌘N",
            "⌘C",
            "⌘V",
            "⌘X",
            "⌘Z",
            "⇧⌘Z",
            "⌘A",
            "⌘S",
            "⌘P",
            "⌘O",
            "⌘R",
            "⌘`",
            "⌥⌘Space",
            "⌃⌘Space",
            "⌃⌘F"
        ]
    );
    for (keys, glyph, reason) in WELL_KNOWN {
        assert!(!reason.is_empty());
        if let Ok(parsed) = Accelerator::parse(keys) {
            assert_eq!(well_known(&parsed), Some(*reason), "{keys}");
            assert_eq!(parsed.describe(), *glyph);
        } else {
            assert_eq!(*keys, "Super+Backquote");
        }
    }
    assert_eq!(
        well_known(&acc("Super+KeyW")),
        Some("⌘W closes the window in most apps.")
    );
}

#[test]
fn well_known_alt_only() {
    assert!(well_known(&acc("Alt+KeyA")).is_some());
    assert!(well_known(&acc("Alt+Shift+KeyA")).is_some());
    assert!(well_known(&acc("Alt+Digit1")).is_some());
    assert_eq!(well_known(&acc("Control+Alt+KeyA")), None);
    assert_eq!(well_known(&acc("Alt+Super+KeyJ")), None);
}
