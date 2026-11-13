//! The one entry point for an action (ADR-020): `actions::run(app, ActionId, Source)`. The menu,
//! the global shortcut, the tray, the key monitor and the webview all end here, so a toggle
//! behaves the same wherever it was asked. A second request for the same action within
//! [`DEDUP`] is dropped, so a key heard by two routes runs once.
//!
//! The full-screen ids run today's Focus window and its display choice until H4 swaps the
//! implementation behind the same ids.

use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use orasenda_service::keyboard::{ActionId, Source};
use orasenda_service::session::Action;
use tauri::{AppHandle, Manager};

use crate::ipc::FocusViewError;
use crate::runtime::session;
use crate::windows::{self, AppOps, Ops, Toggled, focus, open_capture_on, toggle_floater_on};

/// A repeat of the same action inside this window is the same press heard twice.
pub(crate) const DEDUP: Duration = Duration::from_millis(300);

/// When each action last ran, for the de-duplication. Managed state.
#[derive(Default)]
pub struct Recent {
    seen: Mutex<Vec<(ActionId, Instant)>>,
    /// Held while a window route runs, so two admitted runs never overlap.
    windows: Mutex<()>,
}

impl Recent {
    fn lock(&self) -> MutexGuard<'_, Vec<(ActionId, Instant)>> {
        self.seen.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Runs `f` with no other window route running. Only for a blocking thread: `f` may wait on
    /// the main thread, which must never take this lock.
    pub(crate) fn serialized<R>(&self, f: impl FnOnce() -> R) -> R {
        let _turn = self.windows.lock().unwrap_or_else(PoisonError::into_inner);
        f()
    }

    /// Whether `id` may run at `now`. When it may, `now` is remembered, so the window counts from
    /// the last run and not from a request that was dropped.
    pub(crate) fn admit(&self, id: ActionId, now: Instant) -> bool {
        let mut seen = self.lock();
        match seen.iter_mut().find(|(seen_id, _)| *seen_id == id) {
            Some((_, at)) if now.saturating_duration_since(*at) < DEDUP => false,
            Some((_, at)) => {
                *at = now;
                true
            }
            None => {
                seen.push((id, now));
                true
            }
        }
    }
}

/// What an action does, apart from the app handle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Route {
    StartPause,
    Window(WindowRoute),
}

/// The actions that are a window change, which a fake platform can run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum WindowRoute {
    Floater,
    Capture,
    /// The Focus window of the main window's display, or (`other`) of the next display.
    FocusWindow {
        other: bool,
    },
    LeaveFocusWindow,
}

/// What a window route did, so the app can tell the session and the menus.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Outcome {
    FloaterOpened,
    FloaterClosed,
    FocusOpened,
    Done,
}

pub(crate) fn route(id: ActionId) -> Route {
    match id {
        ActionId::StartPause => Route::StartPause,
        ActionId::Floater => Route::Window(WindowRoute::Floater),
        ActionId::Capture => Route::Window(WindowRoute::Capture),
        ActionId::FullScreen => Route::Window(WindowRoute::FocusWindow { other: false }),
        ActionId::FullScreenOther => Route::Window(WindowRoute::FocusWindow { other: true }),
        ActionId::LeaveFullScreen => Route::Window(WindowRoute::LeaveFocusWindow),
    }
}

/// The display a Focus window opens on: the main window's, or the first other one.
fn focus_display<O: Ops>(ops: &O, other: bool) -> Result<String, FocusViewError> {
    let screens = ops.screens()?;
    let main = ops
        .main_display()
        .filter(|id| screens.iter().any(|screen| &screen.id == id))
        .or_else(|| screens.first().map(|screen| screen.id.clone()))
        .ok_or_else(|| FocusViewError::no_display("No display is connected."))?;
    if !other {
        return Ok(main);
    }
    screens
        .into_iter()
        .map(|screen| screen.id)
        .find(|id| *id != main)
        .ok_or_else(|| FocusViewError::no_display("There is no other display."))
}

/// Runs a window route on the platform `ops`.
pub(crate) fn perform_on<O: Ops>(ops: &O, route: WindowRoute) -> Result<Outcome, FocusViewError> {
    match route {
        WindowRoute::Floater => toggle_floater_on(ops).map(|toggled| match toggled {
            Toggled::Opened => Outcome::FloaterOpened,
            Toggled::Closed => Outcome::FloaterClosed,
        }),
        WindowRoute::Capture => open_capture_on(ops).map(|()| Outcome::Done),
        WindowRoute::FocusWindow { other } => {
            let display = focus_display(ops, other)?;
            focus::open_focus_on(ops, &display).map(|()| Outcome::FocusOpened)
        }
        WindowRoute::LeaveFocusWindow => {
            for label in ops.focus_labels() {
                ops.close(&label);
            }
            Ok(Outcome::Done)
        }
    }
}

/// Runs `id` now, on this (blocking) thread. Failures are returned, never swallowed.
fn perform(app: &AppHandle, id: ActionId) -> Result<(), String> {
    match route(id) {
        Route::StartPause => session::run_action(app, Action::StartPauseToggle)
            .map(|_| ())
            .map_err(|error| error.message),
        Route::Window(window) => {
            let ops = AppOps::new(app);
            let result = match app.try_state::<Recent>() {
                Some(recent) => recent.serialized(|| perform_on(&ops, window)),
                None => perform_on(&ops, window),
            };
            if matches!(result, Ok(Outcome::FloaterOpened | Outcome::FocusOpened)) {
                windows::note_opened(app);
            }
            if window == WindowRoute::Floater {
                windows::surfaces_changed(app);
            }
            result.map(|_| ()).map_err(|error| error.message)
        }
    }
}

/// The one entry point. Drops a repeat of `id` within [`DEDUP`], then runs it off the calling
/// thread (a window waits on the main thread, the session on its lock). A failure is logged.
pub fn run(app: &AppHandle, id: ActionId, source: Source) {
    let admitted = app
        .try_state::<Recent>()
        .is_none_or(|recent| recent.admit(id, Instant::now()));
    if !admitted {
        return;
    }
    #[cfg(debug_assertions)]
    eprintln!("actions: {id:?} from {source:?} admitted");
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(message) = perform(&app, id) {
            eprintln!("actions: {id:?} from {source:?} failed: {message}");
        }
    });
}
