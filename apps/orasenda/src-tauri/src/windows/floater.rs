//! The floater: a small always-on-top timer panel, label `floater`, loading `floater.html`.

use orasenda_service::windows::{Frame, Limits, default_frame, frame_within};

use super::{Ops, Screen, WindowSpec, screen_of};
use crate::ipc::FocusViewError;
use crate::lifecycle::MAIN;

/// The floater's window label (granted by `capabilities/floater.json`).
pub(crate) const FLOATER: &str = "floater";

// The `floater-*` tokens (packages/tokens/tokens.json), in points; a test reads the file.
pub(crate) const WIDTH: u32 = 280;
pub(crate) const HEIGHT: u32 = 64;
pub(crate) const MIN_HEIGHT: u32 = 56;
pub(crate) const MAX_WIDTH: u32 = 360;
pub(crate) const MAX_HEIGHT: u32 = 96;
/// The gap from the screen edge of a new floater: the `space-6` token.
pub(crate) const EDGE_INSET: u32 = 32;

/// Where the floater's keys are heard (spec Open question 1; hands-on H3 and H4 choose).
/// `Webview`: the page handles Space, Return and Esc, and the app menu gets the three chords.
/// `Monitor`: a local `NSEvent` monitor consumes all six (`floater_keys.rs`). Flipping it is a
/// one-line change.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum KeyRoute {
    Webview,
    #[cfg_attr(
        all(not(test), target_os = "macos"),
        expect(dead_code, reason = "chosen by the owner's hands-on check")
    )]
    Monitor,
}

pub(crate) const KEY_ROUTE: KeyRoute = KeyRoute::Webview;

pub(crate) const LIMITS: Limits = Limits {
    min_width: WIDTH,
    min_height: MIN_HEIGHT,
    max_width: MAX_WIDTH,
    max_height: MAX_HEIGHT,
};

/// The floater: no decorations, sized by the `floater-*` tokens, hidden until it is framed.
pub(crate) fn floater_window_spec() -> WindowSpec {
    WindowSpec {
        label: FLOATER.into(),
        page: "floater.html".into(),
        title: "Orasenda timer",
        width: f64::from(WIDTH),
        height: f64::from(HEIGHT),
        min_size: Some((f64::from(WIDTH), f64::from(MIN_HEIGHT))),
        max_size: Some((f64::from(MAX_WIDTH), f64::from(MAX_HEIGHT))),
        decorations: false,
        resizable: true,
        skip_taskbar: true,
        visible: false,
    }
}

/// Where a new floater goes: its stored frame on a connected display, clamped; else the
/// default frame on the main window's display.
fn start_frame<'a, O: Ops>(
    ops: &O,
    screens: &'a [Screen],
) -> Result<(&'a Screen, Frame), FocusViewError> {
    ops.migrate_frames(screens);
    let ids: Vec<&str> = screens.iter().map(|screen| screen.id.as_str()).collect();
    if let Some((id, stored)) = ops.load_frame(&ids)
        && let Ok(screen) = screen_of(screens, &id)
    {
        return Ok((screen, frame_within(stored, screen.visible, LIMITS)));
    }
    let main_id = ops
        .main_display()
        .filter(|id| ids.contains(&id.as_str()))
        .or_else(|| ids.first().map(|id| (*id).to_owned()))
        .ok_or_else(|| FocusViewError::no_display("No display is connected."))?;
    let screen = screen_of(screens, &main_id)?;
    Ok((
        screen,
        default_frame(screen.visible, (WIDTH, HEIGHT), EDGE_INSET),
    ))
}

/// Hides `main`, unless it is in full screen: there it stays (spec H4, Leaving).
fn hide_main_unless_full_screen<O: Ops>(ops: &O) -> Result<(), FocusViewError> {
    if ops.main_full_screen() {
        Ok(())
    } else {
        ops.hide_main()
    }
}

/// Gives the open floater key focus and hides `main` (not in full screen).
fn refocus<O: Ops>(ops: &O) -> Result<(), FocusViewError> {
    ops.key(FLOATER)?;
    hide_main_unless_full_screen(ops)
}

/// Opens the floater at its frame, shows it with key focus without activating, then hides
/// `main`. When it is shown already: key focus, and `main` still hides. One window exists.
pub(crate) fn open_floater_on<O: Ops>(ops: &O) -> Result<(), FocusViewError> {
    if ops.exists(FLOATER) {
        return refocus(ops);
    }
    let screens = ops.screens()?;
    let (screen, frame) = start_frame(ops, &screens)?;
    if let Err(error) = ops.create(&floater_window_spec()) {
        // A second open raced the first and its window now exists.
        return if ops.exists(FLOATER) {
            refocus(ops)
        } else {
            Err(error)
        };
    }
    let ready = ops
        .make_floater(FLOATER)
        .and_then(|()| ops.place(FLOATER, &screen.id, frame))
        .and_then(|()| ops.show(FLOATER))
        .and_then(|()| ops.key(FLOATER));
    if let Err(error) = ready {
        ops.close(FLOATER);
        return Err(error);
    }
    hide_main_unless_full_screen(ops)
}

/// Closes the floater, if any. `CloseRequested` saves its frame (`frames.rs`).
pub(crate) fn close_floater_on<O: Ops>(ops: &O) {
    if ops.exists(FLOATER) {
        ops.close(FLOATER);
    }
}

/// What a toggle did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Toggled {
    Opened,
    Closed,
}

/// The floater's one binding (ADR-016): hidden, it opens and `main` hides; shown, it closes
/// and `main` shows and takes focus again.
pub(crate) fn toggle_floater_on<O: Ops>(ops: &O) -> Result<Toggled, FocusViewError> {
    if !ops.exists(FLOATER) {
        return open_floater_on(ops).map(|()| Toggled::Opened);
    }
    // `main` first, so the user is never left with no window; then the floater closes.
    let back = ops.show(MAIN).and_then(|()| ops.focus(MAIN));
    close_floater_on(ops);
    back.map(|()| Toggled::Closed)
}
