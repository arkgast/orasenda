//! The connected displays, display-relative window frames and screen-change observation.
//!
//! A display's key is `"<NSScreenNumber>-<localizedName>"` made label-safe (Open question 2
//! of the Focus views spec: the fallback). `CGDisplayCreateUUIDFromDisplayID` is declared in
//! ColorSync, which `objc2-core-graphics` does not bind, so it would need a new binding. The
//! number is the `CGDirectDisplayID`: stable while the display stays connected, and it keeps
//! two monitors with the same name apart. A key that no longer matches after a relaunch is
//! accepted degradation (the floater opens at its default position).

use std::ffi::c_void;
use std::ptr::NonNull;

use block2::RcBlock;
use objc2::MainThreadMarker;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, ProtocolObject};
use objc2_app_kit::{NSApplicationDidChangeScreenParametersNotification, NSScreen};
use objc2_foundation::{
    NSNotification, NSNotificationCenter, NSNumber, NSObjectProtocol, NSPoint, NSRect, NSSize,
    NSString,
};

use super::{WindowError, main_thread, window};

/// A rectangle in points. Which corner is the origin depends on the function that returns it.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A connected display, in global top-left points (the primary display's top-left is the
/// origin and y grows downward).
#[derive(Debug, Clone, PartialEq)]
pub struct Display {
    /// The label-safe key ([`display_key`]); the Focus window is `focus-<id>`.
    pub id: String,
    pub name: String,
    pub frame: Rect,
    /// `frame` without the menu bar and the Dock.
    pub visible: Rect,
}

/// AppKit's global bottom-left rectangle as global top-left, where `primary_height` is the
/// primary display's height. The conversion flips y about the primary's top edge.
pub fn to_top_left(appkit: Rect, primary_height: f64) -> Rect {
    Rect {
        y: primary_height - (appkit.y + appkit.height),
        ..appkit
    }
}

/// The inverse of [`to_top_left`]. The flip is its own inverse, so this is the same formula.
pub fn to_appkit(top_left: Rect, primary_height: f64) -> Rect {
    to_top_left(top_left, primary_height)
}

/// `raw` reduced to ASCII letters, digits and single hyphens, never empty, so that
/// `focus-<key>` is a valid Tauri window label. Idempotent.
pub fn display_key(raw: &str) -> String {
    let mut key = String::new();
    for c in raw.chars() {
        if c.is_ascii_alphanumeric() {
            key.push(c);
        } else if !key.ends_with('-') {
            key.push('-');
        }
    }
    let key = key.trim_matches('-');
    if key.is_empty() {
        "display".into()
    } else {
        key.into()
    }
}

/// A global top-left `frame` as integer points relative to the display's top-left.
pub(crate) fn to_relative(display: &Display, frame: Rect) -> Rect {
    Rect {
        x: (frame.x - display.frame.x).round(),
        y: (frame.y - display.frame.y).round(),
        width: frame.width.round(),
        height: frame.height.round(),
    }
}

/// The inverse of [`to_relative`], in whole points.
pub(crate) fn from_relative(display: &Display, relative: Rect) -> Rect {
    Rect {
        x: (display.frame.x + relative.x).round(),
        y: (display.frame.y + relative.y).round(),
        width: relative.width.round(),
        height: relative.height.round(),
    }
}

/// The display whose frame holds the centre of `frame` (global top-left), if any.
pub(crate) fn display_containing(displays: &[Display], frame: Rect) -> Option<&Display> {
    let (cx, cy) = (frame.x + frame.width / 2.0, frame.y + frame.height / 2.0);
    displays.iter().find(|d| {
        let f = d.frame;
        cx >= f.x && cx < f.x + f.width && cy >= f.y && cy < f.y + f.height
    })
}

/// The connected displays in `NSScreen.screens` order (the primary first). Main thread only.
pub fn displays() -> Result<Vec<Display>, WindowError> {
    let mtm = main_thread()?;
    let screens = NSScreen::screens(mtm);
    let Some(primary) = screens.firstObject() else {
        return Ok(Vec::new());
    };
    let height = primary.frame().size.height;
    Ok(screens
        .iter()
        .enumerate()
        .map(|(index, screen)| describe(&screen, index, height))
        .collect())
}

fn describe(screen: &NSScreen, index: usize, primary_height: f64) -> Display {
    let name = screen.localizedName().to_string();
    Display {
        id: display_key(&format!("{}-{name}", screen_number(screen, index))),
        name,
        frame: to_top_left(rect_of(screen.frame()), primary_height),
        visible: to_top_left(rect_of(screen.visibleFrame()), primary_height),
    }
}

/// `NSScreenNumber` (the `CGDirectDisplayID`). A screen that does not report one gets
/// `i<index>`, which is valid in a label but only as stable as the screen order.
fn screen_number(screen: &NSScreen, index: usize) -> String {
    let description = screen.deviceDescription();
    description
        .objectForKey(&NSString::from_str("NSScreenNumber"))
        .and_then(|value| value.downcast::<NSNumber>().ok())
        .map_or_else(|| format!("i{index}"), |n| n.unsignedIntValue().to_string())
}

fn rect_of(rect: NSRect) -> Rect {
    Rect {
        x: rect.origin.x,
        y: rect.origin.y,
        width: rect.size.width,
        height: rect.size.height,
    }
}

/// The screen with display key `key`, or `UnknownDisplay`.
pub(crate) fn screen_with_key(
    mtm: MainThreadMarker,
    key: &str,
) -> Result<Retained<NSScreen>, WindowError> {
    let screens = NSScreen::screens(mtm);
    let height = screens
        .firstObject()
        .map_or(0.0, |primary| primary.frame().size.height);
    screens
        .iter()
        .enumerate()
        .find(|(index, screen)| describe(screen, *index, height).id == key)
        .map(|(_, screen)| screen)
        .ok_or_else(|| WindowError::UnknownDisplay(key.into()))
}

/// The window's display key and its frame in integer points relative to that display's
/// top-left; `None` off the main thread, on null, on a non-window, or when the window's
/// centre is on no display.
///
/// # Safety
///
/// `ns_window` must be null or point to a live `NSWindow` (or subclass) object that stays
/// alive for the duration of the call (the contract of `overlay.rs`).
pub unsafe fn frame_of(ns_window: *mut c_void) -> Option<(String, Rect)> {
    main_thread().ok()?;
    let window = window(ns_window).ok()?;
    let all = displays().ok()?;
    let height = all.first().map(|d| d.frame.height)?;
    let global = to_top_left(rect_of(window.frame()), height);
    let display = display_containing(&all, global)?;
    Some((display.id.clone(), to_relative(display, global)))
}

/// Moves and sizes the window to `frame`, integer points relative to the top-left of the
/// display with key `display_id`. `UnknownDisplay` when that display is gone. Main thread only.
///
/// # Safety
///
/// Same contract as [`frame_of`]; null and non-windows are errors.
pub unsafe fn set_frame(
    ns_window: *mut c_void,
    display_id: &str,
    frame: Rect,
) -> Result<(), WindowError> {
    main_thread()?;
    let window = window(ns_window)?;
    let all = displays()?;
    let display = all
        .iter()
        .find(|d| d.id == display_id)
        .ok_or_else(|| WindowError::UnknownDisplay(display_id.into()))?;
    let primary_height = all.first().map_or(0.0, |d| d.frame.height);
    let target = to_appkit(from_relative(display, frame), primary_height);
    window.setFrame_display(
        NSRect::new(
            NSPoint::new(target.x, target.y),
            NSSize::new(target.width, target.height),
        ),
        true,
    );
    Ok(())
}

/// Keeps a screen-parameters observer registered; dropping it unregisters.
pub struct ScreenObserver(Retained<ProtocolObject<dyn NSObjectProtocol>>);

impl Drop for ScreenObserver {
    fn drop(&mut self) {
        // SAFETY: the token came from `addObserverForName:...` on this same center.
        unsafe { NSNotificationCenter::defaultCenter().removeObserver(self.0.as_ref()) };
    }
}

/// Calls `callback` whenever the display configuration changes (a display is connected,
/// removed, moved or changes resolution). It runs on the thread that posts the change, the
/// main thread, so it must only schedule work. Main thread only.
pub fn observe_screen_changes(
    callback: Box<dyn Fn() + Send + Sync>,
) -> Result<ScreenObserver, WindowError> {
    main_thread()?;
    let block = RcBlock::new(move |_: NonNull<NSNotification>| callback());
    // SAFETY: the name is the AppKit constant, the block is copied by the center, and the
    // returned token is kept in `ScreenObserver` until it is removed.
    let token = unsafe {
        NSNotificationCenter::defaultCenter().addObserverForName_object_queue_usingBlock(
            Some(NSApplicationDidChangeScreenParametersNotification),
            None::<&AnyObject>,
            None,
            &block,
        )
    };
    Ok(ScreenObserver(token))
}
