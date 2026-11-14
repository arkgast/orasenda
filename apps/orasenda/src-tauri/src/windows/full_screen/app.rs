//! `main`'s full screen on the app: the Tauri window behind [`FsOps`], the observer of the
//! window's notifications, and the thread that follows each one up. macOS only; every other
//! platform answers `unavailable`.

#[cfg(all(desktop, target_os = "macos"))]
pub(crate) use mac::install;
#[cfg(target_os = "macos")]
pub(crate) use mac::{is_on, spawn_close, with_full_screen};
#[cfg(all(desktop, not(target_os = "macos")))]
pub(crate) use other::install;
#[cfg(not(target_os = "macos"))]
pub(crate) use other::{is_on, spawn_close, with_full_screen};

#[cfg(not(target_os = "macos"))]
mod other {
    use tauri::AppHandle;

    use crate::ipc::FullScreenError;
    use crate::windows::full_screen::{FsOps, FullScreen};

    pub(crate) fn with_full_screen<T>(
        _app: &AppHandle,
        _work: impl FnOnce(&FullScreen, &dyn FsOps) -> Result<T, FullScreenError>,
    ) -> Result<T, FullScreenError> {
        Err(FullScreenError::unavailable("Full screen needs macOS."))
    }

    pub(crate) fn is_on(_app: &AppHandle) -> bool {
        false
    }

    pub(crate) fn install(_app: &AppHandle) {}

    pub(crate) fn spawn_close(_app: &AppHandle) {}
}

#[cfg(target_os = "macos")]
mod mac {
    use std::sync::mpsc;
    use std::thread;

    use orasenda_platform_macos::windows::{FullScreenEvent, observe_full_screen};
    use orasenda_service::session::{run_full_screen_entered, run_full_screen_hints_left};
    use orasenda_service::windows::Frame;
    use tauri::{AppHandle, Manager};
    use tauri_specta::Event as _;

    use crate::ipc::{FullScreenError, WindowView};
    use crate::lifecycle::MAIN;
    use crate::runtime::ticker::AppHost;
    use crate::windows::full_screen::{FsOps, FullScreen, Observed};
    use crate::windows::{AppOps, Ops, screen_of};

    /// `main` as the sequencer sees it.
    pub(super) struct AppFs {
        app: AppHandle,
    }

    impl AppFs {
        fn window(&self) -> Result<tauri::WebviewWindow, FullScreenError> {
            self.app
                .get_webview_window(MAIN)
                .ok_or_else(|| FullScreenError::unavailable("There is no main window."))
        }
    }

    fn tauri_error(error: tauri::Error) -> FullScreenError {
        eprintln!("full screen: {error}");
        FullScreenError::failed("Orasenda couldn't change the window. Try again.")
    }

    impl FsOps for AppFs {
        fn visible(&self) -> bool {
            self.window()
                .and_then(|w| w.is_visible().map_err(tauri_error))
                .unwrap_or(false)
        }

        fn minimized(&self) -> bool {
            self.window()
                .and_then(|w| w.is_minimized().map_err(tauri_error))
                .unwrap_or(false)
        }

        fn show(&self) -> Result<(), FullScreenError> {
            let window = self.window()?;
            window.show().map_err(tauri_error)?;
            window.set_focus().map_err(tauri_error)
        }

        fn unminimize(&self) -> Result<(), FullScreenError> {
            self.window()?.unminimize().map_err(tauri_error)
        }

        fn set_full_screen(&self, on: bool) -> Result<(), FullScreenError> {
            self.window()?.set_fullscreen(on).map_err(tauri_error)
        }

        fn hide(&self) -> Result<(), FullScreenError> {
            self.window()?.hide().map_err(tauri_error)
        }

        fn has_display(&self, id: &str) -> bool {
            AppOps::new(&self.app)
                .screens()
                .is_ok_and(|screens| screens.iter().any(|screen| screen.id == id))
        }

        fn display(&self) -> Option<String> {
            AppOps::new(&self.app).window_display(MAIN)
        }

        fn move_to(&self, id: &str) -> Result<(), FullScreenError> {
            let window = self.window()?;
            let ops = AppOps::new(&self.app);
            let screens = ops.screens()?;
            let visible = screen_of(&screens, id)?.visible;
            let scale = window.scale_factor().map_err(tauri_error)?;
            let size = window.outer_size().map_err(tauri_error)?;
            // Keep the window's size, centred on the display's usable area.
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let fit = |physical: u32, room: u32| ((f64::from(physical) / scale) as u32).min(room);
            let (width, height) = (
                fit(size.width, visible.width),
                fit(size.height, visible.height),
            );
            let frame = Frame {
                x: visible.x + i32::try_from((visible.width - width) / 2).unwrap_or(0),
                y: visible.y + i32::try_from((visible.height - height) / 2).unwrap_or(0),
                width,
                height,
            };
            ops.place(MAIN, id, frame)?;
            Ok(())
        }

        fn hints_left(&self) -> u8 {
            run_full_screen_hints_left(&AppHost::new(&self.app))
        }

        fn bump_hint(&self) -> u8 {
            run_full_screen_entered(&AppHost::new(&self.app))
        }

        fn publish(&self, view: &WindowView) {
            if let Err(error) = view.emit(&self.app) {
                eprintln!("full screen: could not emit window-view: {error}");
            }
        }
    }

    /// Runs `work` with the managed state and `main`.
    pub(crate) fn with_full_screen<T>(
        app: &AppHandle,
        work: impl FnOnce(&FullScreen, &dyn FsOps) -> Result<T, FullScreenError>,
    ) -> Result<T, FullScreenError> {
        let state = app
            .try_state::<FullScreen>()
            .ok_or_else(|| FullScreenError::unavailable("Full screen isn't ready yet."))?;
        work(&state, &AppFs { app: app.clone() })
    }

    pub(crate) fn is_on(app: &AppHandle) -> bool {
        app.try_state::<FullScreen>()
            .is_some_and(|state| state.is_on())
    }

    /// Starts watching `main` for the life of the app (call on the main thread, after `main`
    /// exists). A watch that can't start is logged: full screen then ends by its timeout.
    pub(crate) fn install(app: &AppHandle) {
        let Some(window) = app.get_webview_window(MAIN) else {
            eprintln!("full screen: no {MAIN} window to watch");
            return;
        };
        let pointer = match window.ns_window() {
            Ok(pointer) => pointer,
            Err(error) => return eprintln!("full screen: no NSWindow to watch: {error}"),
        };
        let (send, receive) = mpsc::channel::<Observed>();
        let handle = app.clone();
        let spawned = thread::Builder::new()
            .name("full-screen-events".into())
            .spawn(move || {
                for event in receive {
                    if let Some(state) = handle.try_state::<FullScreen>() {
                        state.after_event(
                            &AppFs {
                                app: handle.clone(),
                            },
                            event,
                        );
                    }
                }
            });
        if let Err(error) = spawned {
            return eprintln!("full screen: could not start the events thread: {error}");
        }
        let watcher = app.clone();
        let send = std::sync::Mutex::new(send);
        // SAFETY: `pointer` is `main`'s NSWindow from Tauri, and this runs on the main thread.
        let observed = unsafe {
            observe_full_screen(
                pointer,
                Box::new(move |event| {
                    let event = match event {
                        FullScreenEvent::DidEnter => Observed::Entered,
                        FullScreenEvent::DidExit => Observed::Exited,
                        FullScreenEvent::DidFail => Observed::Failed,
                    };
                    if let Some(state) = watcher.try_state::<FullScreen>() {
                        state.observe(event);
                    }
                    let sender = send
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner);
                    if sender.send(event).is_err() {
                        eprintln!("full screen: the events thread is gone");
                    }
                }),
            )
        };
        match observed {
            // One observer for the whole run: dropping it would stop the updates.
            Ok(observer) => std::mem::forget(observer),
            Err(error) => eprintln!("full screen: not watching {MAIN}: {error}"),
        }
    }

    /// Closing `main` in full screen: leave, wait for did-exit, hide. Off the calling thread.
    pub(crate) fn spawn_close(app: &AppHandle) {
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            if let Err(error) = with_full_screen(&app, |state, ops| state.close_main(ops)) {
                eprintln!("full screen: could not close {MAIN}: {}", error.message);
            }
        });
    }
}
