//! The ColorSync display UUID: the stable part of a display's key.
//!
//! `CGDisplayCreateUUIDFromDisplayID` is declared in ColorSync, which `objc2-core-graphics`
//! does not bind, so the two functions and `CFRelease` are declared here, in one place.
//! The UUID survives relaunches and re-plugging the same display, and differs between two
//! monitors of the same model.

use std::ffi::c_void;
use std::sync::Mutex;

use objc2_foundation::NSString;

type CFTypeRef = *const c_void;

#[link(name = "ColorSync", kind = "framework")]
unsafe extern "C" {
    /// Returns a new `CFUUIDRef` (the caller releases it), or null.
    fn CGDisplayCreateUUIDFromDisplayID(display: u32) -> CFTypeRef;
}

#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    /// Returns a new `CFStringRef` (the caller releases it), or null.
    fn CFUUIDCreateString(allocator: CFTypeRef, uuid: CFTypeRef) -> CFTypeRef;
    fn CFRelease(object: CFTypeRef);
}

/// The ColorSync UUID of the display `number` (a `CGDirectDisplayID`) as text, or `None`
/// when ColorSync has none for it (null UUID or null string).
pub(super) fn display_uuid(number: u32) -> Option<String> {
    // SAFETY: plain call with an integer; it returns an owned CFUUID or null.
    let uuid = unsafe { CGDisplayCreateUUIDFromDisplayID(number) };
    if uuid.is_null() {
        return None;
    }
    // SAFETY: `uuid` is a live CFUUID owned by us, and a null allocator means the default.
    let string = unsafe { CFUUIDCreateString(std::ptr::null(), uuid) };
    // SAFETY: `uuid` is owned by us and not used again.
    unsafe { CFRelease(uuid) };
    if string.is_null() {
        return None;
    }
    // SAFETY: `string` is a live CFString, toll-free bridged to NSString, and is only read
    // here, before it is released.
    let text = unsafe { &*string.cast::<NSString>() }.to_string();
    // SAFETY: `string` is owned by us and not used again.
    unsafe { CFRelease(string) };
    Some(text)
}

/// The raw (not yet label-safe) key and the legacy raw key of a screen. The UUID wins; when
/// there is none (or the screen has no number) the legacy form is used and logged.
pub(super) fn raw_keys(number: Option<u32>, index: usize, name: &str) -> (String, String) {
    choose_keys(number.and_then(display_uuid), number, index, name)
}

/// The UUID when there is one, else the legacy key (logged once per display per process).
pub(super) fn choose_keys(
    uuid: Option<String>,
    number: Option<u32>,
    index: usize,
    name: &str,
) -> (String, String) {
    let legacy = legacy_raw(number, index, name);
    match uuid {
        Some(uuid) => (uuid, legacy),
        None => {
            static LOGGED: Mutex<Vec<String>> = Mutex::new(Vec::new());
            if let Ok(mut logged) = LOGGED.lock()
                && !logged.contains(&legacy)
            {
                eprintln!("displays: no ColorSync UUID for {name:?}; keyed by its screen number");
                logged.push(legacy.clone());
            }
            (legacy.clone(), legacy)
        }
    }
}

/// Today's form, `"<NSScreenNumber>-<localizedName>"`; `i<index>` for a screen without a number.
pub(super) fn legacy_raw(number: Option<u32>, index: usize, name: &str) -> String {
    match number {
        Some(n) => format!("{n}-{name}"),
        None => format!("i{index}-{name}"),
    }
}
