//! Window lifecycle (spec: Windows): closing `main` hides it, the Dock and *Show Orasenda*
//! bring it back, ⌘Q and *Quit Orasenda* quit. The activation policy stays `Regular`.

use std::sync::{Mutex, PoisonError};
#[cfg(desktop)]
use tauri::AppHandle;

use tauri::{Manager, Wry};

use crate::ipc::NavigatePage;
use crate::scheduler;

/// The label of the app's main window (`tauri.conf.json`).
pub(crate) const MAIN: &str = "main";

/// A page the webview has been asked to show but has not taken yet, so a request made before
/// it listens is not lost. The mutex is held only for the swap, never across a window call.
#[derive(Default)]
pub(crate) struct PendingNavigate(Mutex<Option<NavigatePage>>);

impl PendingNavigate {
    /// Stores the page; the last one wins.
    #[cfg_attr(
        not(test),
        expect(dead_code, reason = "called by lifecycle::show_settings, T5 (#146)")
    )]
    pub(crate) fn set(&self, page: NavigatePage) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(page);
    }

    /// Returns the stored page and clears it.
    pub(crate) fn take(&self) -> Option<NavigatePage> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner).take()
    }
}

/// What a close request on a window does.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CloseAction {
    /// Prevent the close and hide the window; the process and the menu-bar item stay.
    Hide,
    /// Let the window close.
    Pass,
}

/// `main` hides on close; every other window (the spike overlay) closes as usual.
pub(crate) fn on_close_requested(label: &str) -> CloseAction {
    if label == MAIN {
        CloseAction::Hide
    } else {
        CloseAction::Pass
    }
}

/// Adds the window-event handler: `Focused(true)` publishes the clock and the session
/// (T7), and `CloseRequested` on `main` hides it instead of closing.
pub fn install(builder: tauri::Builder<Wry>) -> tauri::Builder<Wry> {
    builder.on_window_event(|window, event| match event {
        tauri::WindowEvent::Focused(true) => {
            scheduler::publish_focus(window.app_handle());
            if window.label() == MAIN {
                crate::notifications::on_main_focused(window.app_handle());
            }
        }
        tauri::WindowEvent::CloseRequested { api, .. }
            if on_close_requested(window.label()) == CloseAction::Hide =>
        {
            // Hide first: if it fails, the close goes ahead, which quits with the session
            // already persisted, rather than leaving a window that won't close.
            match window.hide() {
                Ok(()) => api.prevent_close(),
                Err(error) => {
                    eprintln!("lifecycle: could not hide {MAIN}, closing it: {error}");
                }
            }
        }
        _ => {}
    })
}

/// Shows, unminimizes and focuses `main`. Runs on the main thread (a menu event or
/// `RunEvent::Reopen`) and holds no lock. Each failure is logged. Desktop only, like the tray
/// that calls it.
#[cfg(desktop)]
pub fn show_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN) else {
        eprintln!("lifecycle: no {MAIN} window to show");
        return;
    };
    if let Err(error) = window.show() {
        eprintln!("lifecycle: could not show {MAIN}: {error}");
    }
    if let Err(error) = window.unminimize() {
        eprintln!("lifecycle: could not unminimize {MAIN}: {error}");
    }
    if let Err(error) = window.set_focus() {
        eprintln!("lifecycle: could not focus {MAIN}: {error}");
    }
}

/// `RunEvent::Reopen` (a Dock click): bring `main` back. The event exists on macOS only.
#[cfg(target_os = "macos")]
pub fn on_reopen(app: &AppHandle) {
    show_main(app);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_requested_on_main_hides_and_other_windows_pass() {
        assert_eq!(on_close_requested("main"), CloseAction::Hide);
        assert_eq!(on_close_requested("overlay"), CloseAction::Pass);
        assert_eq!(on_close_requested("Main"), CloseAction::Pass);
        assert_eq!(on_close_requested(""), CloseAction::Pass);
    }

    #[test]
    fn navigate_take_returns_once() {
        let pending = PendingNavigate::default();
        assert_eq!(pending.take(), None);
        pending.set(NavigatePage::Settings);
        assert_eq!(pending.take(), Some(NavigatePage::Settings));
        assert_eq!(pending.take(), None);
        pending.set(NavigatePage::Today);
        pending.set(NavigatePage::Review);
        assert_eq!(pending.take(), Some(NavigatePage::Review));
    }
}
