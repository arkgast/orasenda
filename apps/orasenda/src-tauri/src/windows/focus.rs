//! The Focus window: one per display, label `focus-<display id>`, loading `focus.html`.

use orasenda_service::windows::Frame;

use super::{Ops, Screen, WindowSpec, screen_of};
use crate::ipc::{FocusInsets, FocusViewError};

const PREFIX: &str = "focus-";

/// The window label for a display id: ASCII letters, digits and single hyphens (a Tauri
/// label allows more, but `focus-*` must match it), never empty after the prefix.
pub(crate) fn focus_label(display_id: &str) -> String {
    let mut key = String::new();
    for ch in display_id.chars() {
        if ch.is_ascii_alphanumeric() {
            key.push(ch);
        } else if !key.is_empty() && !key.ends_with('-') {
            key.push('-');
        }
    }
    let key = key.trim_end_matches('-');
    format!("{PREFIX}{}", if key.is_empty() { "display" } else { key })
}

/// The Focus window of a display: no decorations, not resizable, off the taskbar, hidden
/// until it is framed. The page reads the display and the insets from its query.
pub(crate) fn focus_window_spec(
    display_id: &str,
    size: (u32, u32),
    insets: FocusInsets,
) -> WindowSpec {
    let FocusInsets {
        top,
        right,
        bottom,
        left,
    } = insets;
    WindowSpec {
        label: focus_label(display_id),
        page: format!("focus.html?display={display_id}&insets={top},{right},{bottom},{left}"),
        title: "Orasenda focus",
        width: f64::from(size.0),
        height: f64::from(size.1),
        min_size: None,
        max_size: None,
        decorations: false,
        resizable: false,
        skip_taskbar: true,
        visible: false,
    }
}

/// The part of the display the menu bar and the Dock cover, from the display and its
/// visible frame (both relative to the display's top-left).
pub(crate) fn insets_of(size: (u32, u32), visible: Frame) -> FocusInsets {
    let right_edge = i64::from(visible.x) + i64::from(visible.width);
    let bottom_edge = i64::from(visible.y) + i64::from(visible.height);
    let clamp = |value: i64| u32::try_from(value.max(0)).unwrap_or(0);
    FocusInsets {
        top: clamp(i64::from(visible.y)),
        left: clamp(i64::from(visible.x)),
        right: clamp(i64::from(size.0) - right_edge),
        bottom: clamp(i64::from(size.1) - bottom_edge),
    }
}

/// Focuses the display's Focus window, or creates it: hidden, framed to the whole display,
/// then shown and focused. A window that fails to frame is closed again.
pub(crate) fn open_focus_on<O: Ops>(ops: &O, display_id: &str) -> Result<(), FocusViewError> {
    let screens = ops.screens()?;
    let screen: &Screen = screen_of(&screens, display_id)?;
    let label = focus_label(&screen.id);
    if ops.exists(&label) {
        ops.show(&label)?;
        return ops.focus(&label);
    }
    ops.create(&focus_window_spec(&screen.id, screen.size, screen.insets))?;
    let framed = ops
        .cover_display(&label, &screen.id)
        .and_then(|()| ops.show(&label))
        .and_then(|()| ops.focus(&label));
    if let Err(error) = framed {
        ops.close(&label);
        return Err(error);
    }
    ops.emit_insets(&label, screen.insets);
    Ok(())
}
