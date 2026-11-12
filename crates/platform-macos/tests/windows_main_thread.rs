//! The null-window refusals of the `windows` functions, which are checked after the
//! main-thread check and so need the main thread. libtest never gives a test the main
//! thread, so this file runs without the harness (`harness = false` in `Cargo.toml`).

#[cfg(target_os = "macos")]
fn main() {
    windows_fns_refuse_null_window();
    not_a_window_is_refused();
}

#[cfg(target_os = "macos")]
fn not_a_window_is_refused() {
    let object = objc2::runtime::NSObject::new();
    let ptr = objc2::rc::Retained::as_ptr(&object)
        .cast_mut()
        .cast::<std::ffi::c_void>();
    // SAFETY: points at a live NSObject for the call.
    let r = unsafe { orasenda_platform_macos::windows::configure_floater(ptr) };
    assert_eq!(
        r,
        Err(orasenda_platform_macos::windows::WindowError::NotAWindow)
    );
}

#[cfg(target_os = "macos")]
fn windows_fns_refuse_null_window() {
    use std::ptr::null_mut;

    use orasenda_platform_macos::windows::{
        Rect, WindowError, configure_floater, configure_focus_window, displays, frame_of,
        install_floater_key_monitor, key_without_activation, set_frame,
    };

    let refused = Err(WindowError::NullWindow);
    let any_frame = Rect {
        x: 0.0,
        y: 0.0,
        width: 1.0,
        height: 1.0,
    };
    // SAFETY: null is allowed by the contract and reported as `NullWindow`.
    unsafe {
        assert_eq!(configure_focus_window(null_mut(), "x"), refused);
        assert_eq!(configure_floater(null_mut()), refused);
        assert_eq!(key_without_activation(null_mut()), refused);
        assert_eq!(set_frame(null_mut(), "x", any_frame), refused);
        assert_eq!(frame_of(null_mut()), None);
        assert!(matches!(
            install_floater_key_monitor(null_mut(), Box::new(|_| false)),
            Err(WindowError::NullWindow)
        ));
    }
    // Reading the displays works on the main thread (a headless runner may report none).
    let found = displays().expect("displays on the main thread");
    for display in &found {
        assert!(
            display
                .id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
        );
    }
    println!(
        "windows_main_thread: null refusals ok, {} display(s)",
        found.len()
    );
}

#[cfg(not(target_os = "macos"))]
fn main() {}
