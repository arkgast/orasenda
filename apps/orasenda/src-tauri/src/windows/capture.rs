//! The capture panel: a small non-activating panel, label `capture`, loading `capture.html`.
//! It opens on the display under the pointer, takes keys without activating Orasenda, and
//! closes only through its own pad (save, or Esc on an empty pad).

use super::{Ops, WindowSpec};
use crate::ipc::FocusViewError;

/// The capture panel's window label (granted by `capabilities/capture.json`).
pub(crate) const CAPTURE: &str = "capture";

// The `panel-width` token (packages/tokens/tokens.json), in points; a test reads the file.
pub(crate) const WIDTH: u32 = 420;
/// The window's height. The pad's states all fit inside it (`verification/layout/captureWindow.spec.ts`
/// measures them); the page cannot ask Rust to resize, because the capability grants no window command.
pub(crate) const HEIGHT: u32 = 520;

/// What VoiceOver hears after a save (the pad closes, so it cannot say this itself).
pub(crate) const SAVED: &str = "Saved to Inbox.";

/// The panel: no decorations, not resizable, hidden until it is placed.
pub(crate) fn capture_window_spec() -> WindowSpec {
    WindowSpec {
        label: CAPTURE.into(),
        page: "capture.html".into(),
        title: "Capture a thought",
        width: f64::from(WIDTH),
        height: f64::from(HEIGHT),
        min_size: None,
        max_size: None,
        decorations: false,
        resizable: false,
        skip_taskbar: true,
        visible: false,
    }
}

/// Gives the open panel key focus without activating Orasenda and asks its page to focus the
/// text. It stays where it is: a note being typed never jumps displays.
fn refocus<O: Ops>(ops: &O) -> Result<(), FocusViewError> {
    ops.key(CAPTURE)?;
    ops.emit_capture_focus();
    Ok(())
}

/// Opens the capture panel, or focuses its text when it is open already. One window exists.
pub(crate) fn open_capture_on<O: Ops>(ops: &O) -> Result<(), FocusViewError> {
    if ops.exists(CAPTURE) {
        return refocus(ops);
    }
    if let Err(error) = ops.create(&capture_window_spec()) {
        // A second open raced the first and its window now exists.
        return if ops.exists(CAPTURE) {
            refocus(ops)
        } else {
            Err(error)
        };
    }
    let ready = ops
        .make_capture(CAPTURE)
        .and_then(|()| ops.place_at_pointer(CAPTURE, (WIDTH, HEIGHT)))
        .and_then(|()| ops.show(CAPTURE))
        .and_then(|()| ops.key(CAPTURE));
    if let Err(error) = ready {
        ops.close(CAPTURE);
        return Err(error);
    }
    ops.emit_capture_focus();
    Ok(())
}

/// Closes the capture panel, if any.
pub(crate) fn close_capture_on<O: Ops>(ops: &O) {
    if ops.exists(CAPTURE) {
        ops.close(CAPTURE);
    }
}

/// Announces [`SAVED`] only when the save succeeded; the save's result is returned unchanged.
pub(crate) fn saved_then_announced<O: Ops, T, E>(ops: &O, saved: Result<T, E>) -> Result<T, E> {
    if saved.is_ok() {
        announce_saved_on(ops);
    }
    saved
}

/// Announces [`SAVED`]. The note is saved already, so a failure is logged, not returned.
pub(crate) fn announce_saved_on<O: Ops>(ops: &O) {
    if let Err(error) = ops.announce(SAVED) {
        eprintln!("capture: the save wasn't announced: {}", error.message);
    }
}
