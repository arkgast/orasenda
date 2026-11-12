//! The platform side of [`Ops`](super::Ops). On macOS it creates the windows with Tauri and
//! runs every AppKit call on the main thread through `orasenda-platform-macos`; elsewhere
//! every call answers `unavailable`.

use crate::ipc::FocusViewError;

#[cfg(target_os = "macos")]
pub(crate) use mac::{AppOps, frame_of_window, read_frame_on_main};
#[cfg(not(target_os = "macos"))]
pub(crate) use other::{AppOps, frame_of_window, read_frame_on_main};

fn unavailable() -> FocusViewError {
    FocusViewError::unavailable("Focus views need macOS.")
}

#[cfg(not(target_os = "macos"))]
mod other {
    use orasenda_service::windows::Frame;
    use tauri::{AppHandle, Window};

    use super::{FocusViewError, unavailable};
    use crate::windows::{Ops, Screen, WindowSpec};

    /// No Focus views off macOS.
    pub(crate) struct AppOps;

    impl AppOps {
        pub(crate) fn new(_app: &AppHandle) -> Self {
            Self
        }
    }

    pub(crate) fn frame_of_window(_window: &Window) -> Option<(String, Frame)> {
        None
    }

    pub(crate) fn read_frame_on_main(_app: &AppHandle, _label: &str) -> Option<(String, Frame)> {
        None
    }

    impl Ops for AppOps {
        fn screens(&self) -> Result<Vec<Screen>, FocusViewError> {
            Err(unavailable())
        }
        fn main_display(&self) -> Option<String> {
            None
        }
        fn focus_labels(&self) -> Vec<String> {
            Vec::new()
        }
        fn window_display(&self, _label: &str) -> Option<String> {
            None
        }
        fn exists(&self, _label: &str) -> bool {
            false
        }
        fn create(&self, _spec: &WindowSpec) -> Result<(), FocusViewError> {
            Err(unavailable())
        }
        fn cover_display(&self, _label: &str, _display_id: &str) -> Result<(), FocusViewError> {
            Err(unavailable())
        }
        fn make_floater(&self, _label: &str) -> Result<(), FocusViewError> {
            Err(unavailable())
        }
        fn place(&self, _l: &str, _d: &str, _f: Frame) -> Result<(), FocusViewError> {
            Err(unavailable())
        }
        fn show(&self, _label: &str) -> Result<(), FocusViewError> {
            Err(unavailable())
        }
        fn focus(&self, _label: &str) -> Result<(), FocusViewError> {
            Err(unavailable())
        }
        fn key(&self, _label: &str) -> Result<(), FocusViewError> {
            Err(unavailable())
        }
        fn hide_main(&self) -> Result<(), FocusViewError> {
            Err(unavailable())
        }
        fn load_frame(&self, _displays: &[&str]) -> Option<(String, Frame)> {
            None
        }
        fn emit_insets(&self, _label: &str, _insets: crate::ipc::FocusInsets) {}
        fn close(&self, _label: &str) {}
    }
}

#[cfg(target_os = "macos")]
mod mac {
    use std::ffi::c_void;
    use std::sync::mpsc;

    use orasenda_platform_macos::windows as appkit;
    use orasenda_service::windows::Frame;
    use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, Window};
    use tauri_specta::Event as _;

    use super::{FocusViewError, unavailable};
    use crate::ipc::FocusInsets;
    use crate::lifecycle::MAIN;
    use crate::runtime::ticker::AppHost;
    use crate::windows::floater_keys;
    use crate::windows::focus::insets_of;
    use crate::windows::frames::Frames;
    use crate::windows::{FLOATER, Ops, Screen, WindowSpec};

    /// The app's windows, driven from a thread that is not the main thread.
    pub(crate) struct AppOps {
        app: AppHandle,
    }

    impl AppOps {
        pub(crate) fn new(app: &AppHandle) -> Self {
            Self { app: app.clone() }
        }

        /// Runs `work` on the main thread and waits for its answer; no lock is held here.
        fn on_main<T: Send + 'static>(
            &self,
            work: impl FnOnce() -> T + Send + 'static,
        ) -> Result<T, FocusViewError> {
            run_on_main(&self.app, work).ok_or_else(unavailable)
        }

        /// Runs `work` on the main thread with the AppKit pointer of the window `label`.
        fn with_window<T: Send + 'static>(
            &self,
            label: &str,
            work: impl FnOnce(*mut c_void) -> Result<T, appkit::WindowError> + Send + 'static,
        ) -> Result<T, FocusViewError> {
            let app = self.app.clone();
            let label = label.to_owned();
            self.on_main(move || {
                let window = app.get_webview_window(&label)?;
                let pointer = window.ns_window().ok()?;
                Some(work(pointer))
            })?
            .ok_or_else(unavailable)?
            .map_err(window_error)
        }

        fn window(&self, label: &str) -> Result<tauri::WebviewWindow, FocusViewError> {
            self.app.get_webview_window(label).ok_or_else(unavailable)
        }
    }

    /// `work` on the main thread, waited for. `None` when the main thread is gone.
    pub(super) fn run_on_main<T: Send + 'static>(
        app: &AppHandle,
        work: impl FnOnce() -> T + Send + 'static,
    ) -> Option<T> {
        let (send, receive) = mpsc::channel();
        let queued = app.run_on_main_thread(move || {
            let _ = send.send(work());
        });
        if let Err(error) = queued {
            eprintln!("windows: the main thread is gone: {error}");
            return None;
        }
        receive.recv().ok()
    }

    fn window_error(error: appkit::WindowError) -> FocusViewError {
        eprintln!("windows: {error}");
        match error {
            appkit::WindowError::UnknownDisplay(_) => {
                FocusViewError::no_display("That display isn't connected.")
            }
            _ => FocusViewError::unavailable("The window couldn't be set up."),
        }
    }

    fn tauri_error(error: tauri::Error) -> FocusViewError {
        eprintln!("windows: {error}");
        FocusViewError::unavailable("The window couldn't be opened.")
    }

    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    fn to_frame(rect: appkit::Rect) -> Frame {
        Frame {
            x: rect.x.round() as i32,
            y: rect.y.round() as i32,
            width: rect.width.round().max(0.0) as u32,
            height: rect.height.round().max(0.0) as u32,
        }
    }

    fn to_rect(frame: Frame) -> appkit::Rect {
        appkit::Rect {
            x: f64::from(frame.x),
            y: f64::from(frame.y),
            width: f64::from(frame.width),
            height: f64::from(frame.height),
        }
    }

    /// The window's display and frame; main thread only (the platform refuses elsewhere).
    pub(crate) fn frame_of_window(window: &Window) -> Option<(String, Frame)> {
        let pointer = window.ns_window().ok()?;
        // SAFETY: `pointer` is the live NSWindow of `window`, which outlives this call.
        let (display, rect) = unsafe { appkit::frame_of(pointer) }?;
        Some((display, to_frame(rect)))
    }

    /// The frame of the window `label`, read on the main thread.
    pub(crate) fn read_frame_on_main(app: &AppHandle, label: &str) -> Option<(String, Frame)> {
        let handle = app.clone();
        let label = label.to_owned();
        run_on_main(app, move || {
            let window = handle.get_webview_window(&label)?;
            frame_of_window(&window.as_ref().window())
        })?
    }

    impl Ops for AppOps {
        fn screens(&self) -> Result<Vec<Screen>, FocusViewError> {
            let displays = self.on_main(appkit::displays)?.map_err(window_error)?;
            Ok(displays
                .into_iter()
                .map(|display| {
                    let frame = to_frame(display.frame);
                    let visible = to_frame(appkit::Rect {
                        x: display.visible.x - display.frame.x,
                        y: display.visible.y - display.frame.y,
                        ..display.visible
                    });
                    let size = (frame.width, frame.height);
                    Screen {
                        id: display.id,
                        name: display.name,
                        size,
                        visible,
                        insets: insets_of(size, visible),
                    }
                })
                .collect())
        }

        fn main_display(&self) -> Option<String> {
            self.app.try_state::<Frames>()?.main_display()
        }

        fn exists(&self, label: &str) -> bool {
            self.app.get_webview_window(label).is_some()
        }

        fn focus_labels(&self) -> Vec<String> {
            let mut labels: Vec<String> = self
                .app
                .webview_windows()
                .into_keys()
                .filter(|label| label.starts_with("focus-"))
                .collect();
            labels.sort();
            labels
        }

        fn window_display(&self, label: &str) -> Option<String> {
            read_frame_on_main(&self.app, label).map(|(display, _)| display)
        }

        fn create(&self, spec: &WindowSpec) -> Result<(), FocusViewError> {
            let mut builder = WebviewWindowBuilder::new(
                &self.app,
                spec.label.clone(),
                WebviewUrl::App(spec.page.clone().into()),
            )
            .title(spec.title)
            .inner_size(spec.width, spec.height)
            .decorations(spec.decorations)
            .resizable(spec.resizable)
            .skip_taskbar(spec.skip_taskbar)
            .visible(spec.visible);
            if let Some((width, height)) = spec.min_size {
                builder = builder.min_inner_size(width, height);
            }
            if let Some((width, height)) = spec.max_size {
                builder = builder.max_inner_size(width, height);
            }
            builder.build().map(|_| ()).map_err(tauri_error)
        }

        fn cover_display(&self, label: &str, display_id: &str) -> Result<(), FocusViewError> {
            let display = display_id.to_owned();
            // SAFETY: `pointer` is the live NSWindow of the window, on the main thread.
            self.with_window(label, move |pointer| unsafe {
                appkit::configure_focus_window(pointer, &display)
            })
        }

        fn make_floater(&self, label: &str) -> Result<(), FocusViewError> {
            let app = self.app.clone();
            // SAFETY: as above. The key monitor (only on the `Monitor` route) is installed on
            // the main thread, once, with the panel it listens to.
            self.with_window(label, move |pointer| unsafe {
                appkit::configure_floater(pointer)?;
                floater_keys::install(&app, pointer)
            })
        }

        fn place(&self, label: &str, display_id: &str, frame: Frame) -> Result<(), FocusViewError> {
            let display = display_id.to_owned();
            // SAFETY: as above.
            self.with_window(label, move |pointer| unsafe {
                appkit::set_frame(pointer, &display, to_rect(frame))
            })
        }

        fn show(&self, label: &str) -> Result<(), FocusViewError> {
            self.window(label)?.show().map_err(tauri_error)
        }

        fn focus(&self, label: &str) -> Result<(), FocusViewError> {
            self.window(label)?.set_focus().map_err(tauri_error)
        }

        fn key(&self, label: &str) -> Result<(), FocusViewError> {
            // SAFETY: as above.
            self.with_window(label, |pointer| unsafe {
                appkit::key_without_activation(pointer)
            })
        }

        fn hide_main(&self) -> Result<(), FocusViewError> {
            self.window(MAIN)?.hide().map_err(tauri_error)
        }

        fn load_frame(&self, displays: &[&str]) -> Option<(String, Frame)> {
            crate::runtime::session::run_frame_load(&AppHost::new(&self.app), FLOATER, displays)
        }

        fn emit_insets(&self, label: &str, insets: FocusInsets) {
            if let Err(error) = insets.emit_to(&self.app, label) {
                eprintln!("windows: could not emit focus-insets: {error}");
            }
        }

        fn close(&self, label: &str) {
            if let Some(window) = self.app.get_webview_window(label)
                && let Err(error) = window.close()
            {
                eprintln!("windows: could not close {label}: {error}");
            }
        }
    }
}
