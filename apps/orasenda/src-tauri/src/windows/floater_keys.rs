//! The floater's keys (spec Open question 1), behind [`KEY_ROUTE`](super::floater::KEY_ROUTE).
//!
//! With `Webview` the page hears Space, Return and Esc itself, and ⇧⌘F, ⇧⌘T and ⌘K reach the
//! app menu. With `Monitor` a local `NSEvent` monitor (platform-macos) consumes all six while the
//! floater is key and runs the same Rust paths as the commands and menus; the page's handlers
//! stay but never see those keys. The owner's hands-on (H3, H4) chooses the route.

use orasenda_service::session::Action;

use super::floater::KeyRoute;
use orasenda_core::timer::EngineState;

use crate::ipc::StartRequest;

/// What a floater key does, whichever route hears it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum KeyAction {
    /// Space: pause, resume or start, by what the timer is doing.
    TogglePause,
    /// Return: Open Orasenda (`main_show`).
    OpenOrasenda,
    /// Esc: close the floater (`focus_view_close`).
    Close,
    /// ⇧⌘F: the Focus window on the main window's display.
    FullScreen,
    /// ⇧⌘T: the floater itself, which gets key focus again.
    FloatingTimer,
    /// ⌘K: the command palette in `main`.
    Commands,
}

/// A key handler: true when the key was handled (the monitor then consumes it).
pub(crate) type Handler = Box<dyn Fn(KeyAction) -> bool>;

/// The monitor for `route`: `None` for `Webview` (nothing is installed). With `Monitor`,
/// `install` gets a handler that runs `perform` and consumes the key.
pub(crate) fn install_for<M, E>(
    route: KeyRoute,
    perform: impl Fn(KeyAction) + 'static,
    install: impl FnOnce(Handler) -> Result<M, E>,
) -> Result<Option<M>, E> {
    match route {
        KeyRoute::Webview => Ok(None),
        KeyRoute::Monitor => install(Box::new(move |key| {
            perform(key);
            true
        }))
        .map(Some),
    }
}

/// What Space does for a timer in `state`: the saved preset starts (`quick: false`), a running
/// session pauses and a paused one resumes. The tray's Pause, Resume and Start focus do the same.
pub(crate) fn toggle_action(state: EngineState) -> Action {
    match state {
        EngineState::Running => Action::Pause,
        EngineState::Paused => Action::Resume,
        EngineState::Idle => Action::Start(StartRequest { quick: false }),
    }
}

#[cfg(target_os = "macos")]
pub(crate) use mac::install;

#[cfg(target_os = "macos")]
mod mac {
    use std::cell::RefCell;
    use std::ffi::c_void;

    use orasenda_platform_macos::windows::{self as appkit, FloaterKey, KeyMonitor};
    use tauri::{AppHandle, Manager};

    use super::{KeyAction, install_for, toggle_action};
    use crate::runtime::session;
    use crate::windows::floater::KEY_ROUTE;
    use crate::windows::{self, FLOATER};

    thread_local! {
        // The guard is `!Send`: it lives on the main thread that installed it. A later floater
        // replaces it; until then a stale monitor is inert (it checks that the floater exists
        // and that the event is for its window and that the window is key).
        static MONITOR: RefCell<Option<KeyMonitor>> = const { RefCell::new(None) };
    }

    fn action_of(key: FloaterKey) -> KeyAction {
        match key {
            FloaterKey::Space => KeyAction::TogglePause,
            FloaterKey::Return => KeyAction::OpenOrasenda,
            FloaterKey::Escape => KeyAction::Close,
            FloaterKey::FullScreen => KeyAction::FullScreen,
            FloaterKey::FloatingTimer => KeyAction::FloatingTimer,
            FloaterKey::Commands => KeyAction::Commands,
        }
    }

    /// Installs the key monitor for the floater's window when the route is `Monitor`.
    ///
    /// # Safety
    ///
    /// `ns_window` must be the live `NSWindow` of the floater, and this must run on the main
    /// thread (the platform checks the thread).
    pub(crate) unsafe fn install(
        app: &AppHandle,
        ns_window: *mut c_void,
    ) -> Result<(), appkit::WindowError> {
        let performing = app.clone();
        let listening = app.clone();
        let installed = install_for(
            KEY_ROUTE,
            move |action| perform(&performing, action),
            |handler| {
                let wrapped = Box::new(move |key: FloaterKey| {
                    // A monitor outliving its window must not consume anything.
                    listening.get_webview_window(FLOATER).is_some() && handler(action_of(key))
                });
                // SAFETY: the caller's contract.
                unsafe { appkit::install_floater_key_monitor(ns_window, wrapped) }
            },
        )?;
        if let Some(monitor) = installed {
            MONITOR.with(|slot| *slot.borrow_mut() = Some(monitor));
        }
        Ok(())
    }

    /// Runs on the main thread inside the key event. Anything that waits on the main thread, the
    /// session lock or the store goes to a blocking thread (the tray's rule).
    fn perform(app: &AppHandle, action: KeyAction) {
        match action {
            KeyAction::Commands => windows::open_palette(app),
            KeyAction::OpenOrasenda => {
                crate::lifecycle::show_main(app);
                let app = app.clone();
                tauri::async_runtime::spawn_blocking(move || windows::close_floater(&app));
            }
            other => {
                let app = app.clone();
                tauri::async_runtime::spawn_blocking(move || blocking(&app, other));
            }
        }
    }

    fn blocking(app: &AppHandle, action: KeyAction) {
        match action {
            KeyAction::Close => windows::close_floater(app),
            KeyAction::FloatingTimer => {
                if let Err(error) = windows::open_floater(app) {
                    eprintln!(
                        "floater keys: could not refocus the floater: {}",
                        error.message
                    );
                }
            }
            KeyAction::FullScreen => match windows::main_display(app) {
                Some(display) => {
                    if let Err(error) = windows::open_focus(app, &display) {
                        eprintln!(
                            "floater keys: could not open full screen: {}",
                            error.message
                        );
                    }
                }
                None => eprintln!("floater keys: no display to open full screen on"),
            },
            KeyAction::TogglePause => {
                let view = session::run_view(app);
                if let Err(error) = session::run_action(app, toggle_action(view.state)) {
                    eprintln!("floater keys: the timer refused: {}", error.message);
                }
            }
            KeyAction::OpenOrasenda | KeyAction::Commands => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use std::cell::RefCell;
    use std::rc::Rc;

    use super::*;

    /// The six keys a monitor consumes.
    const MONITOR_KEYS: [KeyAction; 6] = [
        KeyAction::TogglePause,
        KeyAction::OpenOrasenda,
        KeyAction::Close,
        KeyAction::FullScreen,
        KeyAction::FloatingTimer,
        KeyAction::Commands,
    ];

    /// A recording stand-in for the monitor: the handler it was given, and how often it was asked.
    fn install(route: KeyRoute) -> (Option<Handler>, Rc<RefCell<Vec<KeyAction>>>, usize) {
        let performed = Rc::new(RefCell::new(Vec::new()));
        let log = Rc::clone(&performed);
        let asked = RefCell::new(0);
        let handler = install_for::<_, ()>(
            route,
            move |action| log.borrow_mut().push(action),
            |handler| {
                *asked.borrow_mut() += 1;
                Ok(handler)
            },
        )
        .expect("the fake install does not fail");
        (handler, performed, asked.into_inner())
    }

    #[test]
    fn key_route_monitor_consumes_six_keys() {
        let (handler, performed, asked) = install(KeyRoute::Monitor);
        assert_eq!(asked, 1, "one monitor");
        let handler = handler.expect("the Monitor route installs a handler");
        for key in MONITOR_KEYS {
            assert!(handler(key), "{key:?} is consumed");
        }
        // The same six actions the commands and menus run, once each, in order.
        assert_eq!(*performed.borrow(), MONITOR_KEYS);
        assert_eq!(MONITOR_KEYS.len(), 6);
    }

    #[test]
    fn key_route_webview_installs_no_monitor() {
        let (handler, performed, asked) = install(KeyRoute::Webview);
        assert_eq!(asked, 0, "nothing is installed");
        assert!(handler.is_none());
        assert!(performed.borrow().is_empty());
    }

    #[test]
    fn key_route_install_failure_is_not_silent() {
        let failed = install_for(
            KeyRoute::Monitor,
            |_| {},
            |_handler| Err::<(), _>("no monitor"),
        );
        assert_eq!(failed.err(), Some("no monitor"));
    }

    #[test]
    fn space_pauses_resumes_and_starts_the_saved_preset() {
        assert_eq!(toggle_action(EngineState::Running), Action::Pause);
        assert_eq!(toggle_action(EngineState::Paused), Action::Resume);
        assert_eq!(
            toggle_action(EngineState::Idle),
            Action::Start(StartRequest { quick: false })
        );
    }
}
