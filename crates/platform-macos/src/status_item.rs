//! The menu-bar item's accessibility label (design system `MenuBarTimer`, "Menu-bar glyphs").
//!
//! tray-icon 0.25 sets only the title, image and tooltip on the status item's button, so
//! VoiceOver read just the title digits (#107). The app crate reaches the item through
//! `tauri::tray::TrayIcon::with_inner_tray_icon` and `tray_icon::TrayIcon::ns_status_item`.

use objc2_app_kit::{NSAccessibility, NSStatusItem};
use objc2_foundation::NSString;
use orasenda_core::platform::PlatformError;

use crate::main_thread;

/// Sets `label` as the accessibility label of `item`'s button, the element VoiceOver reads
/// for the menu-bar item.
///
/// Main thread only: elsewhere `Other("not on main thread")`, before the item is touched.
/// `Other("status item has no button")` when the item has no button.
pub fn set_status_item_accessibility_label(
    item: &NSStatusItem,
    label: &str,
) -> Result<(), PlatformError> {
    let mtm = main_thread()?;
    let button = item
        .button(mtm)
        .ok_or_else(|| PlatformError::Other("status item has no button".into()))?;
    button.setAccessibilityLabel(Some(&NSString::from_str(label)));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `cargo test` runs tests off the main thread, so this checks the refusal there; the
    /// main-thread path is `tests/status_item.rs`, which runs without the test harness.
    #[test]
    fn set_label_off_main_thread_is_refused_before_touching_the_item() {
        let result = std::thread::spawn(|| {
            // A detached item, never shown: only the thread check may run.
            let item = NSStatusItem::new();
            set_status_item_accessibility_label(&item, "No session")
        })
        .join()
        .unwrap();
        assert_eq!(
            result,
            Err(PlatformError::Other("not on main thread".into()))
        );
    }
}
