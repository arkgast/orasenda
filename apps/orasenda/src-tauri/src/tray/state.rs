//! What the menu bar shows and the state a draw is decided from.

use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use super::menu::{MenuEntry, NextSession, menu_items};
use super::render::{Glyph, header_text, tray_label, tray_title_and_icon};
use crate::ipc::TimerView;

/// What the menu bar shows.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Drawn {
    pub(super) title: Option<String>,
    pub(super) label: String,
    pub(super) glyph: Glyph,
    pub(super) items: Vec<MenuEntry>,
    /// The status header's text, changed with `set_text` (at most once a minute).
    pub(super) header: Option<String>,
}

impl Drawn {
    pub(super) fn of(view: &TimerView, next: &NextSession) -> Drawn {
        let (title, glyph) = tray_title_and_icon(view);
        Drawn {
            title,
            label: tray_label(view),
            glyph,
            items: menu_items(view, next, crate::spike::enabled()),
            header: header_text(view),
        }
    }
}

pub(super) struct TrayState {
    /// The latest view, kept so a settings change can redraw the idle menu.
    pub(super) view: TimerView,
    /// The saved preset and its minutes, as of the last settings change.
    pub(super) next: NextSession,
    /// The latest view's state, not yet taken by a draw.
    pub(super) wanted: Option<Drawn>,
    /// What the menu bar shows; `None` after a failed call, so the next draw redoes it all.
    pub(super) drawn: Option<Drawn>,
    /// Draws posted again for the current `wanted` after a failure.
    pub(super) retries: u32,
    /// Counts renders. A delayed retry carries the number it was scheduled under and is
    /// dropped when a newer render has come since (newest wins).
    pub(super) render_seq: u64,
}

/// How many times a failed draw is posted again for one view.
pub(super) const DRAW_RETRIES: u32 = 3;

/// How long a failed draw waits before it is posted again.
pub(super) const RETRY_DELAY: Duration = Duration::from_millis(250);

pub(super) fn lock_state(state: &Mutex<TrayState>) -> MutexGuard<'_, TrayState> {
    state.lock().unwrap_or_else(PoisonError::into_inner)
}
