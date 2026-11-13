//! The capture panel: a key-capable, non-activating panel that appears over the current app
//! (full-screen apps included) on the display under the pointer, and an accessibility
//! announcement for the host to make once a note is saved (ADR-016).

use std::ffi::c_void;

use objc2::MainThreadMarker;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_app_kit::{
    NSAccessibilityAnnouncementKey, NSAccessibilityAnnouncementRequestedNotification,
    NSAccessibilityPostNotificationWithUserInfo, NSAccessibilityPriorityKey, NSApplication,
    NSEvent, NSFloatingWindowLevel, NSPanel, NSWindowCollectionBehavior, NSWindowLevel,
    NSWindowStyleMask,
};
use objc2_foundation::{NSDictionary, NSNumber, NSPoint, NSRect, NSSize, NSString};
use orasenda_core::platform::PlatformError;

use super::displays::{Display, Rect, displays, to_appkit};
use super::{WindowError, main_thread, window};
use crate::overlay::swap_to_panel_class;

/// How the capture panel behaves: the numbers [`configure_capture`] applies.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CaptureWindowSpec {
    pub level: NSWindowLevel,
    pub collection: NSWindowCollectionBehavior,
    /// `nonactivatingPanel` is in the style mask: keys reach the panel, Orasenda stays inactive.
    pub non_activating: bool,
    /// An `NSPanel` hides on deactivate by default; the capture panel must not.
    pub hides_on_deactivate: bool,
}

/// The capture panel's level and collection behavior: floating, on every Space and over
/// full-screen apps, transient, and out of the window cycle.
pub fn capture_window_spec() -> CaptureWindowSpec {
    CaptureWindowSpec {
        level: NSFloatingWindowLevel,
        collection: NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::Transient
            | NSWindowCollectionBehavior::IgnoresCycle,
        non_activating: true,
        hides_on_deactivate: false,
    }
}

/// Makes the window the capture panel (the floater's class swap, then
/// [`capture_window_spec`]). Once per window, before it is shown. Main thread only.
///
/// # Safety
///
/// `ns_window` must be null or point to a live `NSWindow` (or subclass) object that stays
/// alive for the duration of the call (the contract of `overlay.rs`). Null and non-windows are
/// errors.
pub unsafe fn configure_capture(ns_window: *mut c_void) -> Result<(), WindowError> {
    main_thread()?;
    let window = window(ns_window)?;
    let spec = capture_window_spec();
    swap_to_panel_class(window).map_err(WindowError::Platform)?;
    if spec.non_activating {
        window.setStyleMask(window.styleMask() | NSWindowStyleMask::NonactivatingPanel);
    }
    window.setLevel(spec.level);
    window.setCollectionBehavior(spec.collection);
    let object: &AnyObject = window.as_ref();
    let panel = object
        .downcast_ref::<NSPanel>()
        .ok_or_else(|| WindowError::Platform(PlatformError::Other("not an NSPanel".into())))?;
    panel.setHidesOnDeactivate(spec.hides_on_deactivate);
    Ok(())
}

/// The panel's frame (global top-left points) for a display's `visible` area: centred
/// horizontally, its top edge a sixth of the visible height below the top, so the panel sits in
/// the upper third. Kept inside `visible` when the display is small.
pub fn capture_frame(visible: Rect, width: f64, height: f64) -> Rect {
    let width = width.min(visible.width);
    let height = height.min(visible.height);
    let x = visible.x + ((visible.width - width) / 2.0).floor();
    let top = visible.y + (visible.height / 6.0).floor();
    let y = top.min(visible.y + visible.height - height).max(visible.y);
    Rect {
        x,
        y,
        width,
        height,
    }
}

/// The display holding the global top-left `point`, else the primary (the first).
pub fn display_at(displays: &[Display], point: (f64, f64)) -> Option<&Display> {
    displays
        .iter()
        .find(|d| {
            let f = d.frame;
            point.0 >= f.x && point.0 < f.x + f.width && point.1 >= f.y && point.1 < f.y + f.height
        })
        .or_else(|| displays.first())
}

/// Sizes and places the panel on the display under the pointer (`NSEvent.mouseLocation`, which
/// needs no permission), centred in its upper third. Main thread only.
///
/// # Safety
///
/// Same contract as [`configure_capture`].
pub unsafe fn place_on_pointer_display(
    ns_window: *mut c_void,
    width: f64,
    height: f64,
) -> Result<(), WindowError> {
    main_thread()?;
    let window = window(ns_window)?;
    let all = displays()?;
    let primary_height = all.first().map_or(0.0, |d| d.frame.height);
    let mouse = NSEvent::mouseLocation();
    let display = display_at(&all, (mouse.x, primary_height - mouse.y))
        .ok_or_else(|| WindowError::Platform(PlatformError::Other("no display".into())))?;
    let target = to_appkit(
        capture_frame(display.visible, width, height),
        primary_height,
    );
    window.setFrame_display(
        NSRect::new(
            NSPoint::new(target.x, target.y),
            NSSize::new(target.width, target.height),
        ),
        true,
    );
    Ok(())
}

/// Tells VoiceOver `text` at high priority (an `AnnouncementRequested` notification on the
/// application). The host calls it once a note is saved, before the panel closes. Main thread
/// only.
pub fn announce(text: &str) -> Result<(), WindowError> {
    let mtm: MainThreadMarker = main_thread()?;
    let app = NSApplication::sharedApplication(mtm);
    let message: Retained<NSString> = NSString::from_str(text);
    let high: Retained<NSNumber> = NSNumber::new_isize(90);
    // SAFETY: extern statics from AppKit, initialized before any Rust code runs.
    let (message_key, priority_key) =
        unsafe { (NSAccessibilityAnnouncementKey, NSAccessibilityPriorityKey) };
    let info: Retained<NSDictionary<NSString, AnyObject>> = NSDictionary::from_retained_objects(
        &[message_key, priority_key],
        &[
            Retained::into_super(Retained::into_super(message)),
            Retained::into_super(Retained::into_super(Retained::into_super(high))),
        ],
    );
    let element: &AnyObject = app.as_ref();
    // SAFETY: `element` is the live application object, the notification and keys are AppKit
    // constants, and `info` maps string keys to string and number values.
    unsafe {
        NSAccessibilityPostNotificationWithUserInfo(
            element,
            NSAccessibilityAnnouncementRequestedNotification,
            Some(&info),
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f64, y: f64, width: f64, height: f64) -> Rect {
        Rect {
            x,
            y,
            width,
            height,
        }
    }

    fn display(id: &str, frame: Rect) -> Display {
        Display {
            id: id.into(),
            legacy_id: id.into(),
            name: id.into(),
            frame,
            visible: frame,
        }
    }

    #[test]
    fn capture_window_spec_levels_and_behaviour() {
        let spec = capture_window_spec();
        assert_eq!(spec.level, NSFloatingWindowLevel);
        assert_eq!(
            spec.collection,
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary
                | NSWindowCollectionBehavior::Transient
                | NSWindowCollectionBehavior::IgnoresCycle
        );
        assert!(spec.non_activating);
        assert!(!spec.hides_on_deactivate);
        // Not the floater's `Stationary`, and not a managed (tiled) window.
        assert!(
            !spec
                .collection
                .contains(NSWindowCollectionBehavior::Stationary)
        );
    }

    #[test]
    fn capture_frame_is_centred_in_the_upper_third() {
        let visible = rect(0.0, 25.0, 1440.0, 875.0);
        let frame = capture_frame(visible, 420.0, 300.0);
        assert_eq!(frame.width, 420.0);
        assert_eq!(frame.x, 510.0);
        assert!(frame.y >= visible.y);
        assert!(frame.y + frame.height <= visible.y + visible.height / 3.0 + frame.height);
        assert!(frame.y < visible.y + visible.height / 3.0);
        // A second display to the right keeps its own origin.
        let second = rect(1440.0, -100.0, 1920.0, 1080.0);
        let frame = capture_frame(second, 420.0, 300.0);
        assert_eq!(frame.x, 1440.0 + 750.0);
        assert_eq!(frame.y, -100.0 + 180.0);
    }

    #[test]
    fn capture_frame_stays_inside_a_small_display() {
        let visible = rect(0.0, 0.0, 300.0, 200.0);
        let frame = capture_frame(visible, 420.0, 300.0);
        assert_eq!(frame, rect(0.0, 0.0, 300.0, 200.0));
    }

    #[test]
    fn the_display_under_the_pointer_is_chosen_else_the_primary() {
        let all = [
            display("a", rect(0.0, 0.0, 1440.0, 900.0)),
            display("b", rect(1440.0, 0.0, 1920.0, 1080.0)),
        ];
        assert_eq!(display_at(&all, (10.0, 10.0)).unwrap().id, "a");
        assert_eq!(display_at(&all, (1500.0, 500.0)).unwrap().id, "b");
        assert_eq!(display_at(&all, (-50.0, 5000.0)).unwrap().id, "a");
        assert!(display_at(&[], (0.0, 0.0)).is_none());
    }

    #[test]
    fn off_the_main_thread_everything_refuses() {
        assert_eq!(
            announce("Saved to Inbox."),
            Err(WindowError::NotOnMainThread)
        );
        // SAFETY: null is refused after the main-thread check; nothing is dereferenced.
        let r = unsafe { configure_capture(std::ptr::null_mut()) };
        assert_eq!(r, Err(WindowError::NotOnMainThread));
        let r = unsafe { place_on_pointer_display(std::ptr::null_mut(), 1.0, 1.0) };
        assert_eq!(r, Err(WindowError::NotOnMainThread));
    }
}
