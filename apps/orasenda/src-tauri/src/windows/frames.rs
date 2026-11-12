//! Remembered frames: where `main` is (for the floater's default display) and the floater's
//! own frame, saved at most once per 500 ms while it moves (trailing) and once more when it
//! closes. A frame is read on the main thread with no lock held; the store write runs on a
//! plain thread, never on the main thread.

use std::sync::{Mutex, PoisonError};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager, Window};

use super::{FLOATER, native};
use crate::runtime::ticker::AppHost;

/// How long a burst of moves waits before its one save.
pub(crate) const DEBOUNCE_MS: u64 = 500;

/// A trailing 500 ms debounce on a clock the caller passes in, so it is tested without
/// sleeping. `touch` arms it; `due` fires it once, `cancel` drops a pending fire.
#[derive(Debug, Default)]
pub(crate) struct Trailing {
    fire_at: Option<u64>,
}

impl Trailing {
    /// A move at `now_ms`. Returns when the save is due, only for the first move of a burst:
    /// the caller schedules exactly that one wake-up.
    pub(crate) fn touch(&mut self, now_ms: u64) -> Option<u64> {
        if self.fire_at.is_some() {
            return None;
        }
        let at = now_ms.saturating_add(DEBOUNCE_MS);
        self.fire_at = Some(at);
        Some(at)
    }

    /// Whether the save is due at `now_ms`; true once, then the next move arms it again.
    pub(crate) fn due(&mut self, now_ms: u64) -> bool {
        match self.fire_at {
            Some(at) if now_ms >= at => {
                self.fire_at = None;
                true
            }
            _ => false,
        }
    }

    /// Drops a pending save (the window closed and saved its frame itself).
    pub(crate) fn cancel(&mut self) {
        self.fire_at = None;
    }
}

/// The recorded frames' state, managed by the app.
#[derive(Debug, Default)]
pub(crate) struct Frames {
    main_display: Mutex<Option<String>>,
    floater: Mutex<Trailing>,
}

impl Frames {
    pub(crate) fn main_display(&self) -> Option<String> {
        self.main_display
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    fn set_main_display(&self, display: String) {
        *self
            .main_display
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = Some(display);
    }

    fn floater(&self) -> std::sync::MutexGuard<'_, Trailing> {
        self.floater.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// `main` moved, resized or was shown: remember its display. Main thread (a window event).
pub(crate) fn record_main(window: &Window) {
    let Some(frames) = window.app_handle().try_state::<Frames>() else {
        return;
    };
    if let Some((display, _)) = native::frame_of_window(window) {
        frames.set_main_display(display);
    }
}

/// The floater moved or resized: save its frame once, 500 ms after the first move of a burst.
/// Main thread (a window event); the wait and the write run on their own thread.
pub(crate) fn on_floater_moved(window: &Window) {
    let app = window.app_handle().clone();
    let Some(frames) = app.try_state::<Frames>() else {
        return;
    };
    let now = crate::runtime::session::now_ms();
    let Some(at) = frames.floater().touch(now) else {
        return;
    };
    let spawned = thread::Builder::new()
        .name("floater-frame".into())
        .spawn(move || {
            thread::sleep(Duration::from_millis(at.saturating_sub(now)));
            flush_floater(&app);
        });
    if let Err(error) = spawned {
        eprintln!("windows: could not schedule the floater frame save: {error}");
    }
}

/// Reads the floater's frame on the main thread, then saves it here, off the main thread.
fn flush_floater(app: &AppHandle) {
    let due = app
        .try_state::<Frames>()
        .is_some_and(|frames| frames.floater().due(crate::runtime::session::now_ms()));
    if !due {
        return;
    }
    match native::read_frame_on_main(app, FLOATER) {
        Some((display, frame)) => save(app, &display, frame),
        None => eprintln!("windows: the floater's frame could not be read; not saved"),
    }
}

fn save(app: &AppHandle, display: &str, frame: orasenda_service::windows::Frame) {
    crate::runtime::session::run_frame_save(&AppHost::new(app), FLOATER, display, frame);
}

/// `CloseRequested` on the floater: the window still exists, so its frame is read now (not on
/// `Destroyed`) and saved on a thread; a pending trailing save is dropped.
pub(crate) fn on_floater_close_requested(window: &Window) {
    let app = window.app_handle().clone();
    let read = || native::frame_of_window(window);
    // The guard is gone before the AppKit read: no lock is held across it.
    if let Some(frames) = app.try_state::<Frames>() {
        frames.floater().cancel();
    }
    let frame = read();
    let Some((display, frame)) = frame else {
        eprintln!("windows: the floater's frame could not be read; not saved");
        return;
    };
    let spawned = thread::Builder::new()
        .name("floater-frame".into())
        .spawn(move || save(&app, &display, frame));
    if let Err(error) = spawned {
        eprintln!("windows: could not save the floater frame: {error}");
    }
}
