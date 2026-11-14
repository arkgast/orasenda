//! The one entry point for an action (ADR-020): `actions::run(app, ActionId, Source)`. The menu,
//! the global shortcut, the tray, the key monitor and the webview all end here, so a toggle
//! behaves the same wherever it was asked. A second request for the same action within
//! [`DEDUP`] is dropped, so a key heard by two routes runs once.
//!
//! The full-screen ids drive `main`'s native full screen (ADR-019, `windows::full_screen`).

use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use orasenda_service::keyboard::{ActionId, Source};
use orasenda_service::session::Action;
use tauri::{AppHandle, Manager};

use crate::ipc::FocusViewError;
use crate::runtime::session;
use crate::windows::{self, AppOps, Ops, Toggled, open_capture_on, toggle_floater_on};

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
    FullScreen(FullScreenRoute),
}

/// The actions that change `main`'s full screen.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum FullScreenRoute {
    /// Full screen on the display `main` is on.
    Enter,
    /// With two or more displays the palette's display commands; with one, as [`Self::Enter`].
    ChooseDisplay,
    Leave,
}

/// What *Full screen on another display* does with `displays` connected displays.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum DisplayChoice {
    ThisDisplay,
    Palette,
}

pub(crate) fn display_choice(displays: usize) -> DisplayChoice {
    if displays >= 2 {
        DisplayChoice::Palette
    } else {
        DisplayChoice::ThisDisplay
    }
}

/// The actions that are a window change, which a fake platform can run.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum WindowRoute {
    Floater,
    Capture,
}

/// What a window route did, so the app can tell the session and the menus.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Outcome {
    FloaterOpened,
    FloaterClosed,
    Done,
}

pub(crate) fn route(id: ActionId) -> Route {
    match id {
        ActionId::StartPause => Route::StartPause,
        ActionId::Floater => Route::Window(WindowRoute::Floater),
        ActionId::Capture => Route::Window(WindowRoute::Capture),
        ActionId::FullScreen => Route::FullScreen(FullScreenRoute::Enter),
        ActionId::FullScreenOther => Route::FullScreen(FullScreenRoute::ChooseDisplay),
        ActionId::LeaveFullScreen => Route::FullScreen(FullScreenRoute::Leave),
    }
}

/// Runs a window route on the platform `ops`.
pub(crate) fn perform_on<O: Ops>(ops: &O, route: WindowRoute) -> Result<Outcome, FocusViewError> {
    match route {
        WindowRoute::Floater => toggle_floater_on(ops).map(|toggled| match toggled {
            Toggled::Opened => Outcome::FloaterOpened,
            Toggled::Closed => Outcome::FloaterClosed,
        }),
        WindowRoute::Capture => open_capture_on(ops).map(|()| Outcome::Done),
    }
}

/// Runs a full-screen route. The state is `windows::full_screen`'s (one transition at a time).
fn run_full_screen(app: &AppHandle, route: FullScreenRoute) -> Result<(), String> {
    let result = match route {
        FullScreenRoute::Enter => windows::full_screen::enter(app, None),
        FullScreenRoute::Leave => windows::full_screen::leave(app),
        FullScreenRoute::ChooseDisplay => {
            let displays = AppOps::new(app)
                .screens()
                .map_err(|error| error.message)?
                .len();
            match display_choice(displays) {
                DisplayChoice::ThisDisplay => windows::full_screen::enter(app, None),
                DisplayChoice::Palette => {
                    windows::open_palette_displays(app);
                    Ok(())
                }
            }
        }
    };
    result.map_err(|error| error.message)
}

/// Runs `id` now, on this (blocking) thread. Failures are returned, never swallowed.
fn perform(app: &AppHandle, id: ActionId) -> Result<(), String> {
    match route(id) {
        Route::StartPause => session::run_action(app, Action::StartPauseToggle)
            .map(|_| ())
            .map_err(|error| error.message),
        Route::FullScreen(route) => run_full_screen(app, route),
        Route::Window(window) => {
            let ops = AppOps::new(app);
            let result = match app.try_state::<Recent>() {
                Some(recent) => recent.serialized(|| perform_on(&ops, window)),
                None => perform_on(&ops, window),
            };
            if matches!(result, Ok(Outcome::FloaterOpened)) {
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
