//! The macOS menu-bar item (spec: Menu bar; design system `MenuBarTimer`, "Menu-bar glyphs").
//!
//! The glyphs in `tray/icons/` are template images (black with alpha only) drawn from the
//! design system's mode shapes (`viewBox 0 0 10 10`): `focus` the filled circle (r 5), `paused`
//! the two bars (`M1 1h3v8H1zM6 1h3v8H6z`), `idle` the hollow circle (r 4, stroke 1.5, so about
//! 4.2 px in the asset). Each is one 36×36 px image: an 18×18 pt canvas at 2x, the shape filling
//! the centre 28×28 px (2.8 px per unit, a 4 px margin). `tray-icon` sizes the image to 18 pt
//! high. The title is `remaining` in the system font, or none when idle.
//!
//! Threading (plan, Impact "Threading"): every tray, menu and window call runs on the main
//! thread with no lock held. [`Tray::render`] only records the wanted state under `Tray`'s own
//! small mutex and posts one non-blocking task to the main thread; that task takes the wanted
//! state and the drawn state under the same mutex, releases it, then calls `set_title`,
//! `set_icon` and `set_menu` for what changed. Because every draw runs on the main thread, one
//! after another, the drawn state always matches the menu bar, and a tick costs one
//! `set_title`. Menu actions run `run_action` on a `spawn_blocking` thread.

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Manager, Wry};

use crate::ipc::{Mode, TimerView};
use crate::lifecycle;
use crate::session::{self, Action, NativeSurface, Surfaces};

/// The tray icon's id.
pub(crate) const TRAY_ID: &str = "orasenda";

/// Menu labels, also used as the items' ids. Plain and kind, no exclamation marks.
pub(crate) const PAUSE: &str = "Pause";
pub(crate) const RESUME: &str = "Resume";
pub(crate) const END_SESSION: &str = "End session";
pub(crate) const SHOW: &str = "Show Orasenda";
pub(crate) const QUIT: &str = "Quit Orasenda";

const FOCUS_ICON: Image<'static> = tauri::include_image!("src/tray/icons/focus.png");
const PAUSED_ICON: Image<'static> = tauri::include_image!("src/tray/icons/paused.png");
const IDLE_ICON: Image<'static> = tauri::include_image!("src/tray/icons/idle.png");

/// The menu-bar glyph: the mode's shape, never a colour.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Glyph {
    Focus,
    Paused,
    Idle,
}

impl Glyph {
    fn image(self) -> Image<'static> {
        match self {
            Glyph::Focus => FOCUS_ICON,
            Glyph::Paused => PAUSED_ICON,
            Glyph::Idle => IDLE_ICON,
        }
    }
}

/// The title and glyph for `view`: `remaining` and the mode's shape while a session runs or
/// is paused (frozen digits), no title and the hollow circle when idle.
pub(crate) fn tray_title_and_icon(view: &TimerView) -> (Option<String>, Glyph) {
    match view.mode {
        Mode::Focus => (Some(view.remaining.clone()), Glyph::Focus),
        Mode::Paused => (Some(view.remaining.clone()), Glyph::Paused),
        Mode::Idle => (None, Glyph::Idle),
    }
}

/// The menu for `view`, top to bottom. *Pause*/*Resume* and *End session* only while a
/// session runs or is paused.
pub(crate) fn menu_items(view: &TimerView) -> Vec<&'static str> {
    match view.mode {
        Mode::Focus => vec![PAUSE, END_SESSION, SHOW, QUIT],
        Mode::Paused => vec![RESUME, END_SESSION, SHOW, QUIT],
        Mode::Idle => vec![SHOW, QUIT],
    }
}

/// What the menu bar shows.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Drawn {
    title: Option<String>,
    glyph: Glyph,
    items: Vec<&'static str>,
}

impl Drawn {
    fn of(view: &TimerView) -> Drawn {
        let (title, glyph) = tray_title_and_icon(view);
        Drawn {
            title,
            glyph,
            items: menu_items(view),
        }
    }
}

/// The tray calls [`Tray`] makes, behind a small trait so the render logic is tested with a
/// recording fake.
pub(crate) trait TrayHandle: Send + Sync + 'static {
    /// Runs `task` on the main thread: inline when called there, else posted without waiting.
    fn on_main_thread(&self, task: Box<dyn FnOnce() + Send>) -> Result<(), String>;
    fn set_title(&self, title: Option<&str>) -> Result<(), String>;
    /// Swaps the glyph, keeping it a template image.
    fn set_glyph(&self, glyph: Glyph) -> Result<(), String>;
    fn set_menu(&self, items: &[&'static str]) -> Result<(), String>;
}

#[derive(Default)]
struct TrayState {
    /// The latest view's state, not yet taken by a draw.
    wanted: Option<Drawn>,
    /// What the menu bar shows; `None` after a failed call, so the next draw redoes it all.
    drawn: Option<Drawn>,
}

/// The menu-bar item as a [`NativeSurface`].
pub struct Tray {
    handle: Arc<dyn TrayHandle>,
    state: Arc<Mutex<TrayState>>,
}

impl Tray {
    /// A tray whose item already shows `shown` (the idle item `setup` builds).
    fn new(handle: Arc<dyn TrayHandle>, shown: &TimerView) -> Tray {
        Tray {
            handle,
            state: Arc::new(Mutex::new(TrayState {
                wanted: None,
                drawn: Some(Drawn::of(shown)),
            })),
        }
    }
}

fn lock_state(state: &Mutex<TrayState>) -> MutexGuard<'_, TrayState> {
    state.lock().unwrap_or_else(PoisonError::into_inner)
}

impl NativeSurface for Tray {
    fn render(&self, view: &TimerView) {
        lock_state(&self.state).wanted = Some(Drawn::of(view));
        let handle = Arc::clone(&self.handle);
        let state = Arc::clone(&self.state);
        let posted = self
            .handle
            .on_main_thread(Box::new(move || draw(handle.as_ref(), &state)));
        if let Err(error) = posted {
            eprintln!("tray: could not reach the main thread: {error}");
        }
    }
}

/// On the main thread: take the wanted state under the lock, release it, then make the calls.
fn draw(handle: &dyn TrayHandle, state: &Mutex<TrayState>) {
    let (wanted, drawn) = {
        let mut state = lock_state(state);
        let Some(wanted) = state.wanted.take() else {
            return;
        };
        let drawn = state.drawn.take();
        (wanted, drawn)
    };
    // The lock is released: every call below may wait on AppKit.
    let mut ok = true;
    if drawn.as_ref().map(|d| &d.title) != Some(&wanted.title) {
        ok &= report("set_title", handle.set_title(wanted.title.as_deref()));
    }
    if drawn.as_ref().map(|d| d.glyph) != Some(wanted.glyph) {
        ok &= report("set_icon", handle.set_glyph(wanted.glyph));
    }
    // The menu is rebuilt only when the state class changes (idle, running, paused).
    if drawn.as_ref().map(|d| &d.items) != Some(&wanted.items) {
        ok &= report("set_menu", handle.set_menu(&wanted.items));
    }
    lock_state(state).drawn = ok.then_some(wanted);
}

/// Logs a failed tray call; `true` when it succeeded.
fn report(call: &str, result: Result<(), String>) -> bool {
    match result {
        Ok(()) => true,
        Err(error) => {
            eprintln!("tray: {call} failed: {error}");
            false
        }
    }
}

/// What a menu item does.
pub(crate) enum MenuCommand {
    Session(Action),
    Show,
    Quit,
}

/// The command for a menu item id; `None` for ids that are not the tray's.
pub(crate) fn menu_command(id: &str) -> Option<MenuCommand> {
    match id {
        PAUSE => Some(MenuCommand::Session(Action::Pause)),
        RESUME => Some(MenuCommand::Session(Action::Resume)),
        END_SESSION => Some(MenuCommand::Session(Action::Stop)),
        SHOW => Some(MenuCommand::Show),
        QUIT => Some(MenuCommand::Quit),
        _ => None,
    }
}

/// Runs on the main thread. A session action goes to a blocking thread, so the main thread
/// never waits on the service lock or the scheduler.
fn on_menu_event(app: &AppHandle, id: &str) {
    match menu_command(id) {
        Some(MenuCommand::Session(action)) => {
            let app = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                // `run_action` has already published the true view, so the tray shows it.
                if let Err(error) = session::run_action(&app, action) {
                    eprintln!("tray: menu action refused: {}", error.message);
                }
            });
        }
        Some(MenuCommand::Show) => lifecycle::show_main(app),
        Some(MenuCommand::Quit) => app.exit(0),
        None => {}
    }
}

/// The real tray handle.
struct TauriTray {
    app: AppHandle,
    icon: TrayIcon<Wry>,
}

impl TrayHandle for TauriTray {
    fn on_main_thread(&self, task: Box<dyn FnOnce() + Send>) -> Result<(), String> {
        self.app
            .run_on_main_thread(task)
            .map_err(|error| error.to_string())
    }

    fn set_title(&self, title: Option<&str>) -> Result<(), String> {
        self.icon
            .set_title(title)
            .map_err(|error| error.to_string())
    }

    fn set_glyph(&self, glyph: Glyph) -> Result<(), String> {
        // `set_icon` alone drops the template flag on macOS (tray-icon 0.25.1).
        self.icon
            .set_icon_with_as_template(Some(glyph.image()), true)
            .map_err(|error| error.to_string())
    }

    fn set_menu(&self, items: &[&'static str]) -> Result<(), String> {
        let menu = build_menu(&self.app, items).map_err(|error| error.to_string())?;
        self.icon
            .set_menu(Some(menu))
            .map_err(|error| error.to_string())
    }
}

/// The native menu: the session items, a separator, then *Show* and *Quit*.
fn build_menu(app: &AppHandle, items: &[&'static str]) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    for (index, label) in items.iter().enumerate() {
        if *label == SHOW && index > 0 {
            menu.append(&PredefinedMenuItem::separator(app)?)?;
        }
        menu.append(&MenuItem::with_id(app, *label, *label, true, None::<&str>)?)?;
    }
    Ok(menu)
}

/// Builds the idle menu-bar item and adds it to the [`Surfaces`] that `publish` renders.
pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let idle = TimerView::idle(
        crate::ipc::StoreStatus::Ok,
        orasenda_core::NotificationStatus::Unavailable,
    );
    let (_, glyph) = tray_title_and_icon(&idle);
    let menu = build_menu(handle, &menu_items(&idle))?;
    let icon = TrayIconBuilder::with_id(TRAY_ID)
        .icon(glyph.image())
        .icon_as_template(true)
        .tooltip("Orasenda")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| on_menu_event(app, event.id().as_ref()))
        .build(app)?;
    let tray: Arc<dyn NativeSurface> = Arc::new(Tray::new(
        Arc::new(TauriTray {
            app: handle.clone(),
            icon,
        }),
        &idle,
    ));
    match app.try_state::<Surfaces>() {
        Some(surfaces) => surfaces
            .0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(tray),
        None => eprintln!("tray: no Surfaces in managed state; the menu bar won't follow"),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;
    use std::sync::OnceLock;

    use orasenda_core::{EngineState, NotificationStatus};

    use super::*;
    use crate::ipc::StoreStatus;

    fn idle() -> TimerView {
        TimerView::idle(StoreStatus::Ok, NotificationStatus::Granted)
    }

    fn running(remaining: &str) -> TimerView {
        TimerView {
            state: EngineState::Running,
            mode: Mode::Focus,
            remaining: remaining.into(),
            ..idle()
        }
    }

    fn paused(remaining: &str) -> TimerView {
        TimerView {
            state: EngineState::Paused,
            mode: Mode::Paused,
            remaining: remaining.into(),
            ..idle()
        }
    }

    #[test]
    fn tray_title_and_icon_per_view() {
        assert_eq!(tray_title_and_icon(&idle()), (None, Glyph::Idle));
        assert_eq!(
            tray_title_and_icon(&running("24:59")),
            (Some("24:59".to_string()), Glyph::Focus)
        );
        assert_eq!(
            tray_title_and_icon(&paused("12:34")),
            (Some("12:34".to_string()), Glyph::Paused)
        );
    }

    #[test]
    fn menu_items_per_state() {
        assert_eq!(menu_items(&idle()), [SHOW, QUIT]);
        assert_eq!(
            menu_items(&running("24:59")),
            [PAUSE, END_SESSION, SHOW, QUIT]
        );
        assert_eq!(
            menu_items(&paused("24:59")),
            [RESUME, END_SESSION, SHOW, QUIT]
        );
        assert_eq!(
            [PAUSE, RESUME, END_SESSION, SHOW, QUIT],
            [
                "Pause",
                "Resume",
                "End session",
                "Show Orasenda",
                "Quit Orasenda"
            ]
        );
    }

    #[test]
    fn menu_command_maps_every_tray_item() {
        assert!(matches!(
            menu_command(PAUSE),
            Some(MenuCommand::Session(Action::Pause))
        ));
        assert!(matches!(
            menu_command(RESUME),
            Some(MenuCommand::Session(Action::Resume))
        ));
        assert!(matches!(
            menu_command(END_SESSION),
            Some(MenuCommand::Session(Action::Stop))
        ));
        assert!(matches!(menu_command(SHOW), Some(MenuCommand::Show)));
        assert!(matches!(menu_command(QUIT), Some(MenuCommand::Quit)));
        assert!(menu_command("about").is_none());
    }

    #[derive(Debug, Clone, PartialEq)]
    enum Call {
        Title(Option<String>),
        Glyph(Glyph),
        Menu(Vec<&'static str>),
    }

    /// Records the calls. Each call asserts `Tray`'s lock is free. With `queued`, main-thread
    /// tasks wait in a queue until the test runs them, like posts from another thread.
    #[derive(Default)]
    struct Recorder {
        calls: Mutex<Vec<Call>>,
        state: OnceLock<Arc<Mutex<TrayState>>>,
        queued: bool,
        queue: Mutex<VecDeque<Box<dyn FnOnce() + Send>>>,
        fail_title_once: Mutex<bool>,
    }

    impl Recorder {
        fn record(&self, call: Call) {
            let state = self.state.get().expect("state attached");
            assert!(
                state.try_lock().is_ok(),
                "Tray's lock is held during a tray call"
            );
            self.calls.lock().unwrap().push(call);
        }

        fn take(&self) -> Vec<Call> {
            std::mem::take(&mut *self.calls.lock().unwrap())
        }

        fn run_queue(&self) {
            loop {
                let task = self.queue.lock().unwrap().pop_front();
                match task {
                    Some(task) => task(),
                    None => break,
                }
            }
        }
    }

    impl TrayHandle for Recorder {
        fn on_main_thread(&self, task: Box<dyn FnOnce() + Send>) -> Result<(), String> {
            if self.queued {
                self.queue.lock().unwrap().push_back(task);
            } else {
                task();
            }
            Ok(())
        }

        fn set_title(&self, title: Option<&str>) -> Result<(), String> {
            self.record(Call::Title(title.map(str::to_string)));
            let mut fail = self.fail_title_once.lock().unwrap();
            if *fail {
                *fail = false;
                return Err("no status item".into());
            }
            Ok(())
        }

        fn set_glyph(&self, glyph: Glyph) -> Result<(), String> {
            self.record(Call::Glyph(glyph));
            Ok(())
        }

        fn set_menu(&self, items: &[&'static str]) -> Result<(), String> {
            self.record(Call::Menu(items.to_vec()));
            Ok(())
        }
    }

    fn tray_with(recorder: Recorder) -> (Tray, Arc<Recorder>) {
        let recorder = Arc::new(recorder);
        let tray = Tray::new(recorder.clone(), &idle());
        recorder.state.set(Arc::clone(&tray.state)).ok().unwrap();
        (tray, recorder)
    }

    #[test]
    fn tray_render_skips_set_menu_when_class_unchanged() {
        let (tray, calls) = tray_with(Recorder::default());

        tray.render(&running("24:59"));
        assert_eq!(
            calls.take(),
            [
                Call::Title(Some("24:59".into())),
                Call::Glyph(Glyph::Focus),
                Call::Menu(vec![PAUSE, END_SESSION, SHOW, QUIT]),
            ]
        );

        // A tick costs one `set_title`.
        tray.render(&running("24:58"));
        assert_eq!(calls.take(), [Call::Title(Some("24:58".into()))]);

        // The same view again (a focus republish) costs nothing.
        tray.render(&running("24:58"));
        assert_eq!(calls.take(), []);

        tray.render(&paused("24:58"));
        assert_eq!(
            calls.take(),
            [
                Call::Glyph(Glyph::Paused),
                Call::Menu(vec![RESUME, END_SESSION, SHOW, QUIT]),
            ]
        );

        tray.render(&running("24:58"));
        assert_eq!(
            calls.take(),
            [
                Call::Glyph(Glyph::Focus),
                Call::Menu(vec![PAUSE, END_SESSION, SHOW, QUIT]),
            ]
        );

        tray.render(&idle());
        assert_eq!(
            calls.take(),
            [
                Call::Title(None),
                Call::Glyph(Glyph::Idle),
                Call::Menu(vec![SHOW, QUIT]),
            ]
        );
    }

    /// Two renders from two threads (a tick and a menu *Pause*) whose draws reach the main
    /// thread later: the menu bar ends on the last view, and the next tick costs one title.
    #[test]
    fn queued_renders_draw_the_latest_view_once() {
        let (tray, calls) = tray_with(Recorder {
            queued: true,
            ..Recorder::default()
        });
        tray.render(&running("24:59"));
        tray.render(&paused("24:59"));
        assert_eq!(calls.take(), [], "render itself makes no tray call");

        calls.run_queue();
        assert_eq!(
            calls.take(),
            [
                Call::Title(Some("24:59".into())),
                Call::Glyph(Glyph::Paused),
                Call::Menu(vec![RESUME, END_SESSION, SHOW, QUIT]),
            ]
        );

        tray.render(&paused("24:59"));
        calls.run_queue();
        assert_eq!(calls.take(), []);
    }

    /// A failed call is logged and the next render redraws everything.
    #[test]
    fn failed_tray_call_redraws_everything_next_time() {
        let (tray, calls) = tray_with(Recorder {
            fail_title_once: Mutex::new(true),
            ..Recorder::default()
        });
        tray.render(&running("24:59"));
        assert_eq!(calls.take().len(), 3);

        tray.render(&running("24:58"));
        assert_eq!(
            calls.take(),
            [
                Call::Title(Some("24:58".into())),
                Call::Glyph(Glyph::Focus),
                Call::Menu(vec![PAUSE, END_SESSION, SHOW, QUIT]),
            ]
        );

        tray.render(&running("24:57"));
        assert_eq!(calls.take(), [Call::Title(Some("24:57".into()))]);
    }

    /// `render` may be called from `draw`'s own calls (a surface re-entering on the main
    /// thread) without deadlocking: no lock is held across a tray call.
    #[test]
    fn render_from_inside_a_tray_call_does_not_deadlock() {
        struct Reentrant {
            inner: Recorder,
            tray: OnceLock<std::sync::Weak<Tray>>,
        }
        impl TrayHandle for Reentrant {
            fn on_main_thread(&self, task: Box<dyn FnOnce() + Send>) -> Result<(), String> {
                task();
                Ok(())
            }
            fn set_title(&self, title: Option<&str>) -> Result<(), String> {
                if title == Some("24:59")
                    && let Some(tray) = self.tray.get().and_then(std::sync::Weak::upgrade)
                {
                    tray.render(&running("24:58"));
                }
                self.inner.set_title(title)
            }
            fn set_glyph(&self, glyph: Glyph) -> Result<(), String> {
                self.inner.set_glyph(glyph)
            }
            fn set_menu(&self, items: &[&'static str]) -> Result<(), String> {
                self.inner.set_menu(items)
            }
        }

        let handle = Arc::new(Reentrant {
            inner: Recorder::default(),
            tray: OnceLock::new(),
        });
        let tray = Arc::new(Tray::new(handle.clone(), &idle()));
        handle
            .inner
            .state
            .set(Arc::clone(&tray.state))
            .ok()
            .unwrap();
        handle.tray.set(Arc::downgrade(&tray)).ok().unwrap();

        let (done, finished) = std::sync::mpsc::channel();
        let worker = {
            let tray = Arc::clone(&tray);
            std::thread::spawn(move || {
                tray.render(&running("24:59"));
                done.send(()).unwrap();
            })
        };
        finished
            .recv_timeout(std::time::Duration::from_secs(5))
            .expect("rendered without deadlock");
        worker.join().unwrap();
        assert!(
            handle
                .inner
                .take()
                .contains(&Call::Title(Some("24:58".into())))
        );
    }
}
