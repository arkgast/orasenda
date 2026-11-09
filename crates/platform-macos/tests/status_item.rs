//! Sets and reads back the accessibility label on a real `NSStatusItem`.
//!
//! AppKit status items are main-thread only and libtest runs every test on a worker thread,
//! so this file runs without the harness (`harness = false` in `Cargo.toml`): `main` is the
//! process's main thread.

#[cfg(target_os = "macos")]
fn main() {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSAccessibility, NSStatusBar, NSVariableStatusItemLength};
    use orasenda_platform_macos::set_status_item_accessibility_label;

    let mtm = MainThreadMarker::new().expect("harness = false runs main on the main thread");
    let bar = NSStatusBar::systemStatusBar();
    let item = bar.statusItemWithLength(NSVariableStatusItemLength);

    for label in [
        "No session",
        "Focus, 24 minutes 59 seconds remaining",
        "Paused, 24 minutes 59 seconds remaining",
    ] {
        set_status_item_accessibility_label(&item, label).expect("label set");
        let button = item.button(mtm).expect("a status item has a button");
        let read_back = button.accessibilityLabel().map(|text| text.to_string());
        assert_eq!(read_back.as_deref(), Some(label));
    }

    bar.removeStatusItem(&item);
    println!("status_item: label set and read back on a real NSStatusItem");
}

#[cfg(not(target_os = "macos"))]
fn main() {}
