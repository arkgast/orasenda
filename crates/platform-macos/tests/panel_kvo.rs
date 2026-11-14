//! A window made into a panel must still let go of the KVO observers it had before the swap
//! (#503, #504). AppKit and WebKit observe a Tauri window before `configure_floater` or
//! `configure_capture` swaps its class; if the KVO subclass is still out of the isa chain when
//! the window is torn down, removing those observers throws `NSRangeException` ("Cannot remove
//! an observer … because it is not registered as an observer"), the exception unwinds into Rust
//! and the app aborts ("Rust cannot catch foreign exceptions"). An abort here is that failure.
//!
//! AppKit windows need the main thread, which libtest never gives a test, so this file runs
//! without the harness (`harness = false` in `Cargo.toml`).

/// `configure_floater` or `configure_capture`.
#[cfg(target_os = "macos")]
type Configure =
    unsafe fn(*mut std::ffi::c_void) -> Result<(), orasenda_platform_macos::windows::WindowError>;

#[cfg(target_os = "macos")]
fn main() {
    use orasenda_platform_macos::windows::{configure_capture, configure_floater};

    let panels: [(&str, Configure); 2] = [
        ("floater", configure_floater),
        ("capture", configure_capture),
    ];
    for (name, configure) in panels {
        a_released_panel_lets_go_of_observers_from_before_the_swap(name, configure);
    }
    a_panel_observed_after_the_swap_is_left_as_it_is();
    releasing_a_window_that_was_never_swapped_changes_nothing();
    println!("panel_kvo: ok");
}

#[cfg(target_os = "macos")]
mod support {
    use std::ffi::c_void;

    use objc2::rc::Retained;
    use objc2::runtime::{AnyClass, NSObject};
    use objc2::{MainThreadMarker, MainThreadOnly, msg_send};
    use objc2_app_kit::{NSBackingStoreType, NSWindow, NSWindowStyleMask};
    use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};

    pub fn window() -> Retained<NSWindow> {
        let mtm = MainThreadMarker::new().expect("panel_kvo runs on the main thread");
        // SAFETY: a plain borderless window on the main thread; it is never shown.
        let window = unsafe {
            NSWindow::initWithContentRect_styleMask_backing_defer(
                NSWindow::alloc(mtm),
                NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(200.0, 100.0)),
                NSWindowStyleMask::Borderless,
                NSBackingStoreType::Buffered,
                true,
            )
        };
        // SAFETY: the window is kept alive by the returned `Retained`, not by AppKit.
        unsafe { window.setReleasedWhenClosed(false) };
        window
    }

    pub fn pointer(window: &NSWindow) -> *mut c_void {
        std::ptr::from_ref(window).cast_mut().cast()
    }

    pub fn class_of(window: &NSWindow) -> &'static AnyClass {
        let object: &objc2::runtime::AnyObject = window.as_ref();
        object.class()
    }

    pub fn observe(window: &NSWindow, observer: &NSObject, key: &str) {
        let key = NSString::from_str(key);
        // SAFETY: a valid observer and key path; options 0 and a null context are allowed.
        unsafe {
            let _: () = msg_send![
                window,
                addObserver: observer,
                forKeyPath: &*key,
                options: 0usize,
                context: std::ptr::null_mut::<c_void>()
            ];
        }
    }

    /// Throws `NSRangeException` (and so aborts this process) when KVO can't find the observer.
    pub fn stop_observing(window: &NSWindow, observer: &NSObject, key: &str) {
        let key = NSString::from_str(key);
        // SAFETY: as in `observe`.
        unsafe {
            let _: () = msg_send![window, removeObserver: observer, forKeyPath: &*key];
        }
    }
}

#[cfg(target_os = "macos")]
fn a_released_panel_lets_go_of_observers_from_before_the_swap(name: &str, configure: Configure) {
    use objc2::runtime::NSObject;
    use orasenda_platform_macos::windows::release_panel;
    use support::{class_of, observe, pointer, stop_observing, window};

    let window = window();
    let observer = NSObject::new();
    observe(&window, &observer, "title");
    let observed = class_of(&window);
    assert!(
        observed
            .name()
            .to_string_lossy()
            .starts_with("NSKVONotifying_"),
        "{name}: KVO gave the window its notifying subclass"
    );
    // SAFETY: `window` is a live NSWindow for both calls.
    unsafe {
        configure(pointer(&window)).expect("the swap");
        assert_ne!(
            class_of(&window),
            observed,
            "{name}: the window is a panel now"
        );
        release_panel(pointer(&window)).expect("the release");
    }
    assert_eq!(
        class_of(&window),
        observed,
        "{name}: the class from before the swap is back"
    );
    stop_observing(&window, &observer, "title");
    println!("panel_kvo: {name} released, observer removed");
}

#[cfg(target_os = "macos")]
fn a_panel_observed_after_the_swap_is_left_as_it_is() {
    use objc2::runtime::NSObject;
    use orasenda_platform_macos::windows::{configure_floater, release_panel};
    use support::{class_of, observe, pointer, window};

    let window = window();
    // SAFETY: `window` is a live NSWindow for every call.
    unsafe { configure_floater(pointer(&window)).expect("the swap") };
    // A later observer gives the panel a KVO subclass of its own; putting the old class back
    // would strand that observer, so the release refuses and changes nothing.
    let observer = NSObject::new();
    observe(&window, &observer, "title");
    let observed = class_of(&window);
    // SAFETY: as above.
    let released = unsafe { release_panel(pointer(&window)) };
    assert!(
        released.is_err(),
        "a class changed since the swap is refused"
    );
    assert_eq!(class_of(&window), observed);
    support::stop_observing(&window, &observer, "title");
}

#[cfg(target_os = "macos")]
fn releasing_a_window_that_was_never_swapped_changes_nothing() {
    use orasenda_platform_macos::windows::release_panel;
    use support::{class_of, pointer, window};

    let window = window();
    let before = class_of(&window);
    // SAFETY: `window` is a live NSWindow.
    unsafe { release_panel(pointer(&window)).expect("nothing to release is fine") };
    assert_eq!(class_of(&window), before);
}

#[cfg(not(target_os = "macos"))]
fn main() {}
