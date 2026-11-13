//! Window lifecycle (spec: Windows): closing `main` hides it, the Dock and *Show Orasenda*
//! bring it back, ⌘Q and *Quit Orasenda* quit. The activation policy stays `Regular`.

use std::sync::{Mutex, PoisonError};
use tauri::{AppHandle, Manager, Wry};
use tauri_specta::Event as _;

use crate::ipc::{Navigate, NavigatePage, SettingsTarget, Theme};
use crate::runtime::ticker as scheduler;

/// The label of the app's main window (`tauri.conf.json`).
pub(crate) const MAIN: &str = "main";

/// A page the webview has been asked to show but has not taken yet, so a request made before
/// it listens is not lost. The mutex is held only for the swap, never across a window call.
#[derive(Default)]
pub(crate) struct PendingNavigate(Mutex<Option<Navigate>>);

impl PendingNavigate {
    /// Stores the page; the last one wins.
    #[cfg_attr(
        not(any(desktop, test)),
        expect(dead_code, reason = "called by show_settings, which is desktop only")
    )]
    pub(crate) fn set(&self, navigate: Navigate) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(navigate);
    }

    /// Returns the stored page and clears it.
    pub(crate) fn take(&self) -> Option<Navigate> {
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
    builder
        .on_page_load(|webview, payload| {
            #[cfg(desktop)]
            crate::runtime::recording::on_page_load(webview, payload);
            #[cfg(not(desktop))]
            let _ = (webview, payload);
        })
        .on_window_event(|window, event| {
            #[cfg(desktop)]
            crate::runtime::recording::on_window_event(window, event);
            handle_window_event(window, event);
        })
}

fn handle_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    match event {
        tauri::WindowEvent::Focused(true) => {
            scheduler::publish_focus(window.app_handle());
            if window.label() == MAIN {
                crate::notifications::on_main_focused(window.app_handle());
                crate::data_tasks::spawn_auto_check(window.app_handle());
            }
        }
        // The floater's frame is read while the window still exists (not on `Destroyed`).
        tauri::WindowEvent::CloseRequested { .. } if window.label() == crate::windows::FLOATER => {
            crate::windows::frames::on_floater_close_requested(window);
        }
        tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => match window.label() {
            MAIN => crate::windows::frames::record_main(window),
            crate::windows::FLOATER => crate::windows::frames::on_floater_moved(window),
            _ => {}
        },
        tauri::WindowEvent::Destroyed if window.label() == crate::windows::FLOATER => {
            crate::windows::surfaces_changed(window.app_handle());
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
    }
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
    // Remember which display `main` is on (the floater opens there by default).
    crate::windows::frames::record_main(&window.as_ref().window());
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
    fn store_pending(&self, navigate: Navigate);
    fn show_main(&self);
    fn emit_navigate(&self, navigate: Navigate);
}

impl Shell for AppHandle {
    fn theme(&self) -> Theme {
        crate::runtime::session::current_settings(self).theme
    }

    fn apply_theme(&self, theme: Theme) {
        scheduler::Host::apply_theme(&scheduler::AppHost::new(self), theme);
    }

    fn store_pending(&self, navigate: Navigate) {
        match self.try_state::<PendingNavigate>() {
            Some(pending) => pending.set(navigate),
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

    fn emit_navigate(&self, navigate: Navigate) {
        if let Err(error) = navigate.emit_to(self, MAIN) {
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
pub(crate) fn show_settings_on<S: Shell>(shell: &S, target: Option<SettingsTarget>) {
    let navigate = Navigate {
        page: NavigatePage::Settings,
        target,
    };
    shell.store_pending(navigate.clone());
    shell.show_main();
    shell.emit_navigate(navigate);
}

/// *Settings…* (⌘, in the macOS app menu): show `main` on the Settings page, at its top.
#[cfg(target_os = "macos")]
pub fn show_settings(app: &AppHandle) {
    show_settings_on(app, None);
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
    }

    #[test]
    fn close_requested_focus_and_floater_close() {
        assert_eq!(on_close_requested("floater"), CloseAction::Pass);
        assert_eq!(on_close_requested("focus-69732992"), CloseAction::Pass);
        assert_eq!(on_close_requested("focus-"), CloseAction::Pass);
    }

    #[test]
    fn close_requested_other_labels_pass() {
        assert_eq!(on_close_requested(""), CloseAction::Pass);
    }

    #[test]
    fn navigate_take_returns_once() {
        let pending = PendingNavigate::default();
        assert_eq!(pending.take(), None);
        pending.set(nav(NavigatePage::Settings, None));
        assert_eq!(pending.take(), Some(nav(NavigatePage::Settings, None)));
        assert_eq!(pending.take(), None);
        pending.set(nav(NavigatePage::Today, None));
        pending.set(nav(NavigatePage::Review, None));
        assert_eq!(pending.take(), Some(nav(NavigatePage::Review, None)));
    }

    fn nav(page: NavigatePage, target: Option<SettingsTarget>) -> Navigate {
        Navigate { page, target }
    }

    #[test]
    fn navigate_take_carries_settings_target() {
        let pending = PendingNavigate::default();
        pending.set(nav(NavigatePage::Settings, Some(SettingsTarget::Timer)));
        assert_eq!(
            pending.take(),
            Some(nav(NavigatePage::Settings, Some(SettingsTarget::Timer)))
        );
        assert_eq!(pending.take(), None);
    }

    use std::cell::RefCell;

    use crate::ipc::Theme;

    #[derive(Debug, PartialEq)]
    enum Call {
        ApplyTheme(Theme),
        StorePending(Navigate),
        ShowMain,
        EmitNavigate(Navigate),
    }

    struct Recorder {
        theme: Theme,
        pending: PendingNavigate,
        seen_at_show: RefCell<Option<Navigate>>,
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
        fn store_pending(&self, navigate: Navigate) {
            self.pending.set(navigate.clone());
            self.calls.borrow_mut().push(Call::StorePending(navigate));
        }
        fn show_main(&self) {
            let held = self.pending.0.lock().unwrap().clone();
            *self.seen_at_show.borrow_mut() = held;
            self.calls.borrow_mut().push(Call::ShowMain);
        }
        fn emit_navigate(&self, navigate: Navigate) {
            self.calls.borrow_mut().push(Call::EmitNavigate(navigate));
        }
    }

    #[test]
    fn show_settings_stores_pending_navigation() {
        for target in [None, Some(SettingsTarget::Timer)] {
            let shell = Recorder::new(Theme::System);
            show_settings_on(&shell, target);
            let navigate = nav(NavigatePage::Settings, target);
            assert_eq!(
                *shell.calls.borrow(),
                vec![
                    Call::StorePending(navigate.clone()),
                    Call::ShowMain,
                    Call::EmitNavigate(navigate.clone())
                ]
            );
            assert_eq!(*shell.seen_at_show.borrow(), Some(navigate.clone()));
            assert_eq!(shell.pending.take(), Some(navigate));
            assert_eq!(shell.pending.take(), None);
        }
    }

    #[test]
    fn theme_applied_before_main_shown() {
        for theme in [Theme::Dark, Theme::System] {
            let shell = Recorder::new(theme);
            finish_launch_on(&shell);
            assert_eq!(
                *shell.calls.borrow(),
                vec![Call::ApplyTheme(theme), Call::ShowMain]
            );
        }
    }
}
