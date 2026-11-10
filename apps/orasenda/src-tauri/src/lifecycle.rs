//! Window lifecycle (spec: Windows): closing `main` hides it, the Dock and *Show Orasenda*
//! bring it back, ⌘Q and *Quit Orasenda* quit. The activation policy stays `Regular`.

use std::sync::{Mutex, PoisonError};
use tauri::{AppHandle, Manager, Wry};
use tauri_specta::Event as _;

use crate::ipc::{Navigate, NavigatePage, Theme};
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
        not(any(desktop, test)),
        expect(dead_code, reason = "called by show_settings, which is desktop only")
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

/// The theme, window and navigation calls that launch and *Settings…* make, behind a small
/// trait so their order is tested with a recording fake. None of them holds a lock.
#[cfg_attr(
    not(any(desktop, test)),
    expect(dead_code, reason = "the navigation calls are desktop only")
)]
pub(crate) trait Shell {
    /// The saved theme; the session lock is released before this returns.
    fn theme(&self) -> Theme;
    fn apply_theme(&self, theme: Theme);
    fn store_pending(&self, page: NavigatePage);
    fn show_main(&self);
    fn emit_navigate(&self, page: NavigatePage);
}

impl Shell for AppHandle {
    fn theme(&self) -> Theme {
        crate::session::current_settings(self).theme
    }

    fn apply_theme(&self, theme: Theme) {
        scheduler::Host::apply_theme(self, theme);
    }

    fn store_pending(&self, page: NavigatePage) {
        match self.try_state::<PendingNavigate>() {
            Some(pending) => pending.set(page),
            None => eprintln!("lifecycle: no pending navigation state"),
        }
    }

    fn show_main(&self) {
        #[cfg(desktop)]
        show_main(self);
        #[cfg(not(desktop))]
        match self.get_webview_window(MAIN) {
            Some(window) => {
                if let Err(error) = window.show() {
                    eprintln!("lifecycle: could not show {MAIN}: {error}");
                }
            }
            None => eprintln!("lifecycle: no {MAIN} window to show"),
        }
    }

    fn emit_navigate(&self, page: NavigatePage) {
        if let Err(error) = (Navigate { page }).emit_to(self, MAIN) {
            eprintln!("lifecycle: could not emit navigate: {error}");
        }
    }
}

/// Applies the saved theme, then shows `main`, so its first paint already follows the theme.
pub(crate) fn finish_launch_on<S: Shell>(shell: &S) {
    let theme = shell.theme();
    shell.apply_theme(theme);
    shell.show_main();
}

/// The last step of `setup()`: `main` starts hidden (`tauri.conf.json`).
pub(crate) fn finish_launch(app: &AppHandle) {
    finish_launch_on(app);
}

/// Stores the pending page first, so a webview that is not listening yet still finds it,
/// then shows `main` and emits `navigate`.
#[cfg_attr(
    not(any(desktop, test)),
    expect(dead_code, reason = "the menus that call it are desktop only")
)]
pub(crate) fn show_settings_on<S: Shell>(shell: &S) {
    shell.store_pending(NavigatePage::Settings);
    shell.show_main();
    shell.emit_navigate(NavigatePage::Settings);
}

/// *Settings…* (⌘, or the menu-bar menu): show `main` on the Settings page.
#[cfg(desktop)]
pub fn show_settings(app: &AppHandle) {
    show_settings_on(app);
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

    use std::cell::RefCell;

    use crate::ipc::Theme;

    #[derive(Debug, PartialEq)]
    enum Call {
        ApplyTheme(Theme),
        StorePending(NavigatePage),
        ShowMain,
        EmitNavigate(NavigatePage),
    }

    struct Recorder {
        theme: Theme,
        pending: PendingNavigate,
        seen_at_show: RefCell<Option<NavigatePage>>,
        calls: RefCell<Vec<Call>>,
    }

    impl Recorder {
        fn new(theme: Theme) -> Self {
            Self {
                theme,
                pending: PendingNavigate::default(),
                seen_at_show: RefCell::new(None),
                calls: RefCell::new(Vec::new()),
            }
        }
    }

    impl Shell for Recorder {
        fn theme(&self) -> Theme {
            self.theme
        }
        fn apply_theme(&self, theme: Theme) {
            self.calls.borrow_mut().push(Call::ApplyTheme(theme));
        }
        fn store_pending(&self, page: NavigatePage) {
            self.pending.set(page);
            self.calls.borrow_mut().push(Call::StorePending(page));
        }
        fn show_main(&self) {
            let held = *self.pending.0.lock().unwrap();
            *self.seen_at_show.borrow_mut() = held;
            self.calls.borrow_mut().push(Call::ShowMain);
        }
        fn emit_navigate(&self, page: NavigatePage) {
            self.calls.borrow_mut().push(Call::EmitNavigate(page));
        }
    }

    #[test]
    fn show_settings_stores_pending_navigation() {
        let shell = Recorder::new(Theme::System);
        show_settings_on(&shell);
        assert_eq!(
            *shell.calls.borrow(),
            vec![
                Call::StorePending(NavigatePage::Settings),
                Call::ShowMain,
                Call::EmitNavigate(NavigatePage::Settings)
            ]
        );
        assert_eq!(*shell.seen_at_show.borrow(), Some(NavigatePage::Settings));
        assert_eq!(shell.pending.take(), Some(NavigatePage::Settings));
        assert_eq!(shell.pending.take(), None);
    }

    #[test]
    fn theme_applied_before_main_shown() {
        for theme in [Theme::Dark, Theme::System] {
            let shell = Recorder::new(theme);
            finish_launch_on(&shell);
            assert_eq!(*shell.calls.borrow(), vec![Call::ApplyTheme(theme), Call::ShowMain]);
        }
    }
}
