//! Overlay window control: makes a Tauri window cover the main screen above other apps,
//! including full-screen ones, and take keyboard focus without switching Spaces.
//!
//! Every function needs the main thread (`NSWindow`, `NSApplication` and `NSScreen` are
//! main-thread only) and returns `Other("not on main thread")` elsewhere, before it looks at
//! the window pointer. The app crate gets there with `AppHandle::run_on_main_thread`.
//!
//! `ns_window` is the pointer from Tauri's `WebviewWindow::ns_window()`. The three functions
//! that take it are `unsafe fn`: the caller guarantees it is null or a live `NSWindow` for
//! the duration of the call (see each `# Safety` section). Null is an error, and an object
//! that is not an `NSWindow` is refused before any window method is called.
//!
//! The overlay is a Tauri webview window made into a non-activating `NSPanel` (ADR-004).
//! [`configure_overlay`] stacks the two layers it needs: a screen-saver window level and a
//! collection behavior that joins every Space, then the panel class and style mask.

use std::ffi::{CString, c_void};

use objc2::runtime::{AnyClass, AnyObject};
use objc2::{ClassType, MainThreadOnly, available, define_class, ffi};
use objc2_app_kit::{
    NSApplication, NSPanel, NSResponder, NSScreen, NSScreenSaverWindowLevel, NSWindow,
    NSWindowCollectionBehavior, NSWindowStyleMask,
};
use objc2_foundation::NSObject;
use orasenda_core::platform::PlatformError;

use crate::main_thread;

/// Makes the window the overlay: `level_and_collection`, then `non_activating_panel`, in
/// that order. Main thread only.
///
/// # Safety
///
/// `ns_window` must be null or point to a live `NSWindow` (or subclass) object that stays
/// alive for the duration of the call. Null and objects that are not an `NSWindow` are
/// reported as `PlatformError::Other`, never dereferenced as a window. A dangling pointer,
/// such as a cached `WebviewWindow::ns_window()` value after the window was destroyed, is
/// undefined behavior. Calling off the main thread is an error, not UB: the pointer is not
/// read before the main-thread check.
pub unsafe fn configure_overlay(ns_window: *mut c_void) -> Result<(), PlatformError> {
    main_thread()?;
    let window = window(ns_window)?;
    level_and_collection(window)?;
    non_activating_panel(window)
}

/// Sets the window's frame to `NSScreen::mainScreen` (the screen with the key window), in
/// AppKit's own coordinates, so Tauri's top-left coordinates never get involved. Main thread
/// only; `NotFound` when there is no screen.
///
/// # Safety
///
/// `ns_window` must be null or point to a live `NSWindow` (or subclass) object that stays
/// alive for the duration of the call. Null and objects that are not an `NSWindow` are
/// reported as `PlatformError::Other`, never dereferenced as a window. A dangling pointer,
/// such as a cached `WebviewWindow::ns_window()` value after the window was destroyed, is
/// undefined behavior. Calling off the main thread is an error, not UB: the pointer is not
/// read before the main-thread check.
pub unsafe fn cover_main_screen(ns_window: *mut c_void) -> Result<(), PlatformError> {
    let mtm = main_thread()?;
    let window = window(ns_window)?;
    let screen = NSScreen::mainScreen(mtm).ok_or(PlatformError::NotFound)?;
    window.setFrame_display(screen.frame(), true);
    Ok(())
}

/// Makes the overlay the key window and Orasenda the active app, without switching Spaces:
/// on macOS 14+ cooperative `NSApplication.activate`, on 13 `activateIgnoringOtherApps`.
/// Main thread only.
///
/// # Safety
///
/// `ns_window` must be null or point to a live `NSWindow` (or subclass) object that stays
/// alive for the duration of the call. Null and objects that are not an `NSWindow` are
/// reported as `PlatformError::Other`, never dereferenced as a window. A dangling pointer,
/// such as a cached `WebviewWindow::ns_window()` value after the window was destroyed, is
/// undefined behavior. Calling off the main thread is an error, not UB: the pointer is not
/// read before the main-thread check.
pub unsafe fn focus_overlay(ns_window: *mut c_void) -> Result<(), PlatformError> {
    let mtm = main_thread()?;
    let window = window(ns_window)?;
    window.makeKeyAndOrderFront(None);
    let app = NSApplication::sharedApplication(mtm);
    if available!(macos = 14.0) {
        // Cooperative: succeeds when the active app yielded or the user just acted on us.
        app.activate();
    } else {
        #[allow(deprecated)] // `activate` does not exist before macOS 14.
        app.activateIgnoringOtherApps(true);
    }
    Ok(())
}

/// The base layer, changes on the `NSWindow`:
/// - `level` → `NSScreenSaverWindowLevel` (1000), above the menu bar, the Dock and normal and
///   floating windows of every app;
/// - `collectionBehavior` → `canJoinAllSpaces` (shown on every Space, so no Space switch),
///   `fullScreenAuxiliary` (allowed on a full-screen app's Space), `stationary` (unaffected by
///   Exposé/Mission Control), `ignoresCycle` (skipped by ⌘` window cycling).
fn level_and_collection(window: &NSWindow) -> Result<(), PlatformError> {
    window.setLevel(NSScreenSaverWindowLevel);
    window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::Stationary
            | NSWindowCollectionBehavior::IgnoresCycle,
    );
    Ok(())
}

/// The panel layer, changes on the `NSWindow`:
/// - its class becomes an [`OverlayPanel`] (an `NSPanel` subclass whose `canBecomeKeyWindow`
///   is YES; a borderless panel returns NO, which would break focus and Escape). This drops
///   tao's `TaoWindow` overrides (`canBecomeMainWindow`, `canBecomeKeyWindow` from its
///   `focusable` flag, and drag-on-background in `sendEvent:`); the findings record any
///   behavior lost;
/// - `styleMask` gains `nonactivatingPanel`, so the panel can take key status without
///   activating Orasenda by itself. [`focus_overlay`] still activates the app, so the
///   findings record the combined effect, not this flag alone.
///
/// Setting `nonactivatingPanel` after the window was created may not update the window
/// server's prevents-activation state (`tauri-nspanel` also calls the private
/// `_setPreventsActivation:`); if the panel seems to do nothing, check that first.
///
/// Level and collection behavior are left as they are: it stacks on [`level_and_collection`].
fn non_activating_panel(window: &NSWindow) -> Result<(), PlatformError> {
    swap_to_panel_class(window)?;
    window.setStyleMask(window.styleMask() | NSWindowStyleMask::NonactivatingPanel);
    Ok(())
}

/// The window behind `ns_window`. Only called after [`main_thread`] succeeded.
fn window<'a>(ns_window: *mut c_void) -> Result<&'a NSWindow, PlatformError> {
    // SAFETY: the caller's `# Safety` contract of the public function: `ns_window` is null
    // (handled by `as_ref`) or points to a live Objective-C object for the duration of the
    // call. The reference does not outlive the public function that received the pointer.
    let object = unsafe { ns_window.cast::<AnyObject>().as_ref() }
        .ok_or_else(|| PlatformError::Other("null NSWindow pointer".into()))?;
    object
        .downcast_ref::<NSWindow>()
        .ok_or_else(|| PlatformError::Other("not an NSWindow".into()))
}

define_class!(
    /// The class the overlay window is switched to by [`non_activating_panel`]. It adds no
    /// instance variables, so its layout is exactly `NSPanel`'s, which equals `NSWindow`'s
    /// (`NSPanel` declares no ivars of its own).
    #[unsafe(super(NSPanel, NSWindow, NSResponder, NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "OrasendaOverlayPanel"]
    struct OverlayPanel;

    impl OverlayPanel {
        #[unsafe(method(canBecomeKeyWindow))]
        fn can_become_key_window(&self) -> bool {
            true
        }
    }
);

/// Switches `window`'s class to an [`OverlayPanel`] class with the same instance size
/// (`object_setClass`, the approach of the `tauri-nspanel` plugin). Idempotent.
pub(crate) fn swap_to_panel_class(window: &NSWindow) -> Result<(), PlatformError> {
    let object: &AnyObject = window.as_ref();
    let current = object.class();
    if inherits_from(current, OverlayPanel::class()) {
        return Ok(());
    }
    let target = panel_class_for(current)?;
    // SAFETY: this deviates from objc2's `set_class` precondition that the new class be a
    // subclass of the current one: like `tauri-nspanel`, `target` is a sibling of tao's
    // `TaoWindow` (both descend from `NSWindow`), not a subclass. It is sound here because:
    // - `window` is an `NSWindow` (checked by `downcast_ref`) and we are on the main thread,
    //   so nothing else changes its class concurrently;
    // - layout: `target` descends from `NSPanel` → `NSWindow`, and `NSPanel` adds no ivars
    //   (`panel_class_for` checks `OverlayPanel` and `NSWindow` have the same size), so every
    //   `NSWindow` ivar keeps its offset. The bytes the current class added in
    //   [NSWindow size, current size) are covered by `target`'s padding ivar: the instance
    //   size is unchanged (checked by `panel_class_for` and objc2's debug assertion) and
    //   those bytes are never touched;
    // - tao 0.37.2 / objc2 0.6: `TaoWindow` overrides only `NSWindow` selectors
    //   (`canBecomeMainWindow`, `canBecomeKeyWindow`, `sendEvent:`), so dropping them leaves
    //   every message valid; nothing in tao, wry or tauri checks the window's class; objc2
    //   caches ivar and drop-flag offsets statically at class registration, so tao's
    //   `ivars()` keeps reading its `WindowState` at the same offsets under the padding;
    // - `target` only overrides `canBecomeKeyWindow`, with the same signature;
    // - `TaoWindow`'s `dealloc` no longer runs, but its `WindowState` is a single
    //   `AtomicBool` with no drop glue, so objc2 registers no `dealloc` for it and nothing
    //   leaks.
    // Re-verify all of this on any tao or objc2 upgrade.
    unsafe { AnyObject::set_class(object, target) };
    Ok(())
}

/// The class to swap a window of class `current` to: [`OverlayPanel`] itself when the sizes
/// match, otherwise a runtime subclass of it (`OrasendaOverlayPanel_<current>`) with one
/// padding ivar that makes its instance size equal to `current`'s. Built once per class;
/// the look-up-then-register is not atomic, so production calls come from the main thread.
fn panel_class_for(current: &AnyClass) -> Result<&'static AnyClass, PlatformError> {
    let base = OverlayPanel::class();
    let size = current.instance_size();
    let base_size = base.instance_size();
    // The swap keeps `NSWindow`'s ivar offsets only while `NSPanel` adds no ivars.
    if base_size != NSWindow::class().instance_size() {
        return Err(layout_error(current));
    }
    if size == base_size {
        return Ok(base);
    }
    if size < base_size {
        return Err(layout_error(current));
    }
    let name = CString::new(format!(
        "OrasendaOverlayPanel_{}",
        current.name().to_string_lossy()
    ))
    .map_err(|_| layout_error(current))?;
    let panel = match AnyClass::get(&name) {
        Some(panel) => panel,
        None => build_padded_class(base, &name, size - base_size)
            .ok_or_else(|| layout_error(current))?,
    };
    if panel.instance_size() == size {
        Ok(panel)
    } else {
        Err(layout_error(current))
    }
}

/// Registers `name` as a subclass of `base` with one `padding`-byte ivar.
fn build_padded_class(
    base: &'static AnyClass,
    name: &CString,
    padding: usize,
) -> Option<&'static AnyClass> {
    let encoding = CString::new(format!("[{padding}c]")).ok()?;
    // SAFETY: `base` is a registered class and `name` a NUL-terminated string not yet used
    // by any class (checked by the caller). The ivar is a plain byte array (alignment
    // 2^0), added before `objc_registerClassPair`, as the runtime requires. A registered
    // class is never freed, so the reference is `'static`.
    unsafe {
        let class = ffi::objc_allocateClassPair(base, name.as_ptr(), 0);
        if class.is_null() {
            return None;
        }
        let added = ffi::class_addIvar(
            class,
            c"orasendaPadding".as_ptr(),
            padding,
            0,
            encoding.as_ptr(),
        );
        if !added.as_bool() {
            ffi::objc_disposeClassPair(class);
            return None;
        }
        ffi::objc_registerClassPair(class);
        class.as_ref()
    }
}

fn layout_error(class: &AnyClass) -> PlatformError {
    PlatformError::Other(format!(
        "cannot match the instance layout of {}",
        class.name().to_string_lossy()
    ))
}

/// Whether `class` is `ancestor` or one of its subclasses.
fn inherits_from(class: &AnyClass, ancestor: &AnyClass) -> bool {
    let mut class = Some(class);
    while let Some(c) = class {
        if c == ancestor {
            return true;
        }
        class = c.superclass();
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use objc2::runtime::ClassBuilder;
    use std::ffi::CStr;

    fn not_on_main_thread() -> PlatformError {
        PlatformError::Other("not on main thread".into())
    }

    #[test]
    fn configure_overlay_off_main_thread_errors() {
        // SAFETY: null is allowed by the contract (the main-thread check runs first).
        assert_eq!(
            unsafe { configure_overlay(std::ptr::null_mut()) },
            Err(not_on_main_thread())
        );
    }

    #[test]
    fn cover_main_screen_off_main_thread_errors() {
        // SAFETY: null is allowed by the contract (the main-thread check runs first).
        assert_eq!(
            unsafe { cover_main_screen(std::ptr::null_mut()) },
            Err(not_on_main_thread())
        );
    }

    #[test]
    fn focus_overlay_off_main_thread_errors() {
        // SAFETY: null is allowed by the contract (the main-thread check runs first).
        assert_eq!(
            unsafe { focus_overlay(std::ptr::null_mut()) },
            Err(not_on_main_thread())
        );
    }

    #[test]
    fn overlay_panel_has_the_layout_of_a_plain_window() {
        assert_eq!(
            OverlayPanel::class().instance_size(),
            NSWindow::class().instance_size()
        );
        assert_eq!(
            panel_class_for(NSWindow::class()).unwrap(),
            OverlayPanel::class()
        );
    }

    type ClassCell = std::sync::OnceLock<&'static AnyClass>;

    /// An `NSWindow` subclass with extra ivars, like tao's `TaoWindow`, registered once.
    ///
    /// Each test that builds a padded panel class gets its own window class (`name`):
    /// `panel_class_for`'s look-up-then-register is not atomic, so two parallel tests must
    /// never pad the same class.
    fn window_class_with_ivars(cell: &'static ClassCell, name: &CStr) -> &'static AnyClass {
        cell.get_or_init(|| {
            let mut builder = ClassBuilder::new(name, NSWindow::class()).unwrap();
            builder.add_ivar::<[u64; 5]>(c"state");
            builder.register()
        })
    }

    #[test]
    fn panel_class_for_a_larger_window_class_matches_its_size() {
        static CLASS: ClassCell = ClassCell::new();
        let current = window_class_with_ivars(&CLASS, c"OrasendaTestWindowForPadding");
        assert!(current.instance_size() > OverlayPanel::class().instance_size());

        let panel = panel_class_for(current).unwrap();

        assert_eq!(panel.instance_size(), current.instance_size());
        assert_eq!(panel.superclass(), Some(OverlayPanel::class()));
        assert!(inherits_from(panel, NSPanel::class()));
        // Built once, then reused.
        assert_eq!(panel_class_for(current).unwrap(), panel);
    }

    #[test]
    fn overlay_panel_overrides_can_become_key_window() {
        let key = objc2::sel!(canBecomeKeyWindow);
        let ours = OverlayPanel::class().instance_method(key).unwrap();
        let panel = NSPanel::class().instance_method(key).unwrap();
        assert_ne!(
            ours.implementation() as usize,
            panel.implementation() as usize
        );
    }

    #[test]
    fn panel_class_for_a_smaller_class_is_a_layout_error() {
        assert_eq!(
            panel_class_for(NSObject::class()),
            Err(PlatformError::Other(
                "cannot match the instance layout of NSObject".into()
            ))
        );
    }

    #[test]
    fn swap_to_panel_class_keeps_the_subclass_ivars() {
        const SENTINEL: [u64; 5] = [0xDEAD_BEEF, 1, 2, 3, 0xFEED_FACE];
        static CLASS: ClassCell = ClassCell::new();
        let class = window_class_with_ivars(&CLASS, c"OrasendaTestWindowForSwap");
        let offset = class.instance_variable(c"state").unwrap().offset();
        // SAFETY: a raw, zeroed instance of an `NSWindow` subclass: never initialized, so no
        // window method may run on it. Only the isa (`downcast_ref`, `object_setClass`) and
        // our own ivar are touched, then it is disposed without `dealloc`.
        unsafe {
            let object = ffi::class_createInstance(class, 0);
            assert!(!object.is_null());
            let state = object.cast::<u8>().offset(offset).cast::<[u64; 5]>();
            state.write(SENTINEL);
            let window = (*object).downcast_ref::<NSWindow>().unwrap();

            swap_to_panel_class(window).unwrap();
            let swapped = (*object).class();
            assert!(inherits_from(swapped, OverlayPanel::class()));
            assert_eq!(swapped.instance_size(), class.instance_size());
            assert_eq!(state.read(), SENTINEL);

            // Idempotent: a second call leaves the class as it is.
            swap_to_panel_class(window).unwrap();
            assert_eq!((*object).class(), swapped);

            #[allow(deprecated)] // ARC never frees a raw `class_createInstance` object.
            ffi::object_dispose(object);
        }
    }
}
