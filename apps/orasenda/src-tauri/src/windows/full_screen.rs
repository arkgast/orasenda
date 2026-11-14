//! `main` in native macOS full screen (ADR-019). Orasenda asks with Tauri's `set_fullscreen`;
//! `orasenda-platform-macos` only observes did-enter and did-exit. This module is the
//! sequencer: one transition at a time, a request during a transition waits for it, a
//! did-fail or no notification within 3 s ends it and keeps the state AppKit reports, a hidden
//! `main` is shown (and a minimized one restored) before it enters, moving to another display
//! is leave, wait for did-exit, move, enter, and closing `main` in full screen leaves, waits
//! for did-exit, then hides.
//!
//! The state is read from the notifications alone and lives in memory, so after a quit in
//! full screen the next launch starts normal. The sequencer is tested behind [`FsOps`], a fake
//! of the window; [`app`] is the macOS implementation. Threading: the requests run on a
//! blocking thread and wait; [`FullScreen::observe`] is the one call made on the main thread
//! (the notification block) and only records. The hint count is written, and the view
//! emitted, by [`FullScreen::after_event`] on the events thread, never on the main thread.

use std::sync::{Condvar, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use tauri::AppHandle;

use crate::ipc::{FullScreenError, FullScreenErrorKind, WindowView};

mod app;

#[cfg(desktop)]
pub(crate) use app::install;
pub(crate) use app::spawn_close;

/// How long a transition waits for AppKit's did-enter or did-exit.
pub(crate) const TRANSITION_TIMEOUT: Duration = Duration::from_secs(3);

/// What AppKit (or a failed `set_fullscreen`) said about the window.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Observed {
    Entered,
    Exited,
    Failed,
}

/// What the sequencer needs from `main`, the displays and the store.
pub(crate) trait FsOps {
    fn visible(&self) -> bool;
    fn minimized(&self) -> bool;
    /// Shows `main` and brings it forward.
    fn show(&self) -> Result<(), FullScreenError>;
    fn unminimize(&self) -> Result<(), FullScreenError>;
    /// Asks for the transition (Tauri's `set_fullscreen`). The answer comes as an [`Observed`].
    fn set_full_screen(&self, on: bool) -> Result<(), FullScreenError>;
    fn hide(&self) -> Result<(), FullScreenError>;
    /// Whether a display with this id is connected.
    fn has_display(&self, id: &str) -> bool;
    /// The display `main` is on, when it can be read.
    fn display(&self) -> Option<String>;
    /// Moves `main` (out of full screen) onto a display.
    fn move_to(&self, id: &str) -> Result<(), FullScreenError>;
    /// Entries left that show the hints, read from the store.
    fn hints_left(&self) -> u8;
    /// Counts an entry; returns the entries left before it.
    fn bump_hint(&self) -> u8;
    fn publish(&self, view: &WindowView);
}

#[derive(Debug, Default)]
struct Inner {
    on: bool,
    /// The hints left as the last did-enter counted them.
    hints_left: u8,
    /// Whether `hints_left` belongs to the current entry (set by the count, cleared on did-enter).
    counted: bool,
    /// What was observed since the current step began.
    seen: Vec<Observed>,
}

/// The full-screen state of `main` and the one-at-a-time turn. Managed state.
pub(crate) struct FullScreen {
    turn: Mutex<()>,
    inner: Mutex<Inner>,
    wake: Condvar,
    timeout: Duration,
}

impl Default for FullScreen {
    fn default() -> Self {
        Self::with_timeout(TRANSITION_TIMEOUT)
    }
}

fn failed(message: &str) -> FullScreenError {
    FullScreenError::failed(message)
}

impl FullScreen {
    pub(crate) fn with_timeout(timeout: Duration) -> Self {
        Self {
            turn: Mutex::new(()),
            inner: Mutex::new(Inner::default()),
            wake: Condvar::new(),
            timeout,
        }
    }

    fn inner(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Whether AppKit last reported `main` in full screen.
    pub(crate) fn is_on(&self) -> bool {
        self.inner().on
    }

    /// Records what AppKit said and wakes a waiting step. Cheap and lock-light: it is called
    /// from the notification block on the main thread.
    pub(crate) fn observe(&self, event: Observed) {
        let mut inner = self.inner();
        match event {
            Observed::Entered => {
                inner.on = true;
                inner.counted = false;
            }
            Observed::Exited => inner.on = false,
            Observed::Failed => {}
        }
        inner.seen.push(event);
        self.wake.notify_all();
    }

    /// What follows an observed event, off the main thread: a did-enter counts the entry, and
    /// a change is published.
    pub(crate) fn after_event<O: FsOps + ?Sized>(&self, ops: &O, event: Observed) {
        match event {
            Observed::Entered => {
                let left = ops.bump_hint();
                let mut inner = self.inner();
                inner.hints_left = left;
                inner.counted = true;
            }
            Observed::Exited => {}
            Observed::Failed => return,
        }
        ops.publish(&self.view(ops));
    }

    /// `observe` then `after_event`, for a caller that is not on the main thread.
    #[cfg(test)]
    pub(crate) fn handle<O: FsOps + ?Sized>(&self, ops: &O, event: Observed) {
        self.observe(event);
        self.after_event(ops, event);
    }

    /// The current view, the same value the last `window-view` carried.
    pub(crate) fn view<O: FsOps + ?Sized>(&self, ops: &O) -> WindowView {
        let (counted, entered) = {
            let inner = self.inner();
            (inner.on && inner.counted, inner.hints_left)
        };
        let on_now = self.is_on();
        WindowView {
            full_screen: on_now,
            display: ops.display(),
            hints_left: if counted { entered } else { ops.hints_left() },
        }
    }

    /// Waits for one of `want` (or a did-fail); consumes what was seen. A timeout is an error
    /// and leaves the reported state alone.
    fn wait(&self, want: Observed) -> Result<(), FullScreenError> {
        let deadline = Instant::now() + self.timeout;
        let mut inner = self.inner();
        loop {
            if let Some(found) = inner
                .seen
                .iter()
                .copied()
                .find(|seen| *seen == want || *seen == Observed::Failed)
            {
                inner.seen.clear();
                return if found == want {
                    Ok(())
                } else {
                    Err(failed("Full screen didn't change."))
                };
            }
            let left = deadline.saturating_duration_since(Instant::now());
            if left.is_zero() {
                return Err(FullScreenError::new(
                    FullScreenErrorKind::TimedOut,
                    "Full screen didn't answer in time.",
                ));
            }
            inner = self
                .wake
                .wait_timeout(inner, left)
                .unwrap_or_else(PoisonError::into_inner)
                .0;
        }
    }

    /// One transition: ask, then wait for AppKit's word. A failed ask is a did-fail.
    fn step<O: FsOps + ?Sized>(&self, ops: &O, on: bool) -> Result<(), FullScreenError> {
        self.inner().seen.clear();
        ops.set_full_screen(on)?;
        self.wait(if on {
            Observed::Entered
        } else {
            Observed::Exited
        })
    }

    fn turn(&self) -> MutexGuard<'_, ()> {
        self.turn.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Enters full screen on `main`'s display, or (`display`) on that one. A hidden `main` is
    /// shown and a minimized one restored first. Already there is done.
    pub(crate) fn enter<O: FsOps + ?Sized>(
        &self,
        ops: &O,
        display: Option<&str>,
    ) -> Result<(), FullScreenError> {
        let _turn = self.turn();
        if let Some(id) = display
            && !ops.has_display(id)
        {
            return Err(FullScreenError::new(
                FullScreenErrorKind::NoDisplay,
                "That display isn't connected.",
            ));
        }
        if ops.minimized() {
            ops.unminimize()?;
        }
        if !ops.visible() {
            ops.show()?;
        }
        let elsewhere = display.filter(|id| ops.display().as_deref() != Some(*id));
        if self.is_on() {
            let Some(id) = elsewhere else { return Ok(()) };
            self.step(ops, false)?;
            ops.move_to(id)?;
        } else if let Some(id) = elsewhere {
            ops.move_to(id)?;
        }
        self.step(ops, true)
    }

    /// Leaves full screen. Not in full screen is done.
    pub(crate) fn leave<O: FsOps + ?Sized>(&self, ops: &O) -> Result<(), FullScreenError> {
        let _turn = self.turn();
        if !self.is_on() {
            return Ok(());
        }
        self.step(ops, false)
    }

    /// Closing `main`: leave full screen, wait for did-exit, then hide. When leaving fails
    /// `main` stays as it is.
    pub(crate) fn close_main<O: FsOps + ?Sized>(&self, ops: &O) -> Result<(), FullScreenError> {
        let _turn = self.turn();
        if self.is_on() {
            self.step(ops, false)?;
        }
        ops.hide()
    }
}

/// `main` entered full screen on `display`, or on its own display.
pub(crate) fn enter(app: &AppHandle, display: Option<&str>) -> Result<(), FullScreenError> {
    app::with_full_screen(app, |state, ops| state.enter(ops, display))
}

/// Leaves full screen.
pub(crate) fn leave(app: &AppHandle) -> Result<(), FullScreenError> {
    app::with_full_screen(app, |state, ops| state.leave(ops))
}

/// The view `window_view()` returns.
pub(crate) fn view(app: &AppHandle) -> WindowView {
    app::with_full_screen(app, |state, ops| Ok(state.view(ops))).unwrap_or(WindowView {
        full_screen: false,
        display: None,
        hints_left: 0,
    })
}

/// Whether `main` is in full screen as AppKit last reported.
pub(crate) fn is_on(app: &AppHandle) -> bool {
    app::is_on(app)
}

/// A close request on `main` in full screen: holds the close and starts leave, wait for
/// did-exit, hide. True when it did; false (not in full screen) leaves the close to the caller.
pub(crate) fn hold_close(window: &tauri::Window, api: &tauri::CloseRequestApi) -> bool {
    use tauri::Manager as _;
    let app = window.app_handle();
    if !is_on(app) {
        return false;
    }
    api.prevent_close();
    spawn_close(app);
    true
}
