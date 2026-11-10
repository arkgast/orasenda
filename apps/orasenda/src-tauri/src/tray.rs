//! The macOS menu-bar item (spec: Menu bar; design system `MenuBarTimer`, "Menu-bar glyphs").
//!
//! The glyphs in `tray/icons/` are template images (black with alpha only) drawn from the
//! design system's mode shapes (`viewBox 0 0 10 10`): `focus` the filled circle (r 5), `paused`
//! the two bars (`M1 1h3v8H1zM6 1h3v8H6z`), `idle` the hollow circle (r 4, stroke 1.5, so about
//! 4.2 px in the asset). Each is one 36×36 px image: an 18×18 pt canvas at 2x, the shape filling
//! the centre 28×28 px (2.8 px per unit, a 4 px margin). `tray-icon` sizes the image to 18 pt
//! high. The title is `remaining` in the system font, or none when idle.
//!
//! The design system's spoken name ("Focus, 24 minutes 59 seconds remaining", "No session")
//! is the status item's accessibility label on macOS, which VoiceOver reads (#107), and the
//! tooltip; both change with the title.
//!
//! Threading (plan, Impact "Threading"): every tray, menu and window call runs on the main
//! thread with no lock held. [`Tray::render`] only records the wanted state under `Tray`'s own
//! small mutex and posts one non-blocking task to the main thread; that task takes the wanted
//! state and the drawn state under the same mutex, releases it, then calls `set_title`,
//! `set_icon` and `set_menu` for what changed. Because every draw runs on the main thread, one
//! after another, the drawn state always matches the menu bar, and a tick costs one
//! `set_title`, one `set_tooltip` and one `set_accessibility_label`. A failed call is logged
//! and the draw is posted again after [`RETRY_DELAY`] from a background thread (Tauri runs a
//! post inline when already on the main thread, so an immediate retry would run back to back),
//! at most [`DRAW_RETRIES`] times for one view; a newer render drops an older pending retry.
//! Which view is newest is decided before `render` by `scheduler::publish_view`. Menu actions
//! run `run_action` on a `spawn_blocking` thread.

use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::Duration;

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
pub(crate) const SETTINGS: &str = "Settings…";
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

/// The item's spoken name (design system `MenuBarTimer`, "Menu-bar glyphs"): the mode word
/// and `remainingLabel`, or "No session" when idle. Set as the tooltip and accessibility label.
pub(crate) fn tray_label(view: &TimerView) -> String {
    let mode = match view.mode {
        Mode::Focus => "Focus",
        Mode::Paused => "Paused",
        Mode::Idle => return "No session".to_string(),
    };
    format!("{mode}, {} remaining", view.remaining_label)
}

/// The menu for `view`, top to bottom. *Pause*/*Resume* and *End session* only while a
/// session runs or is paused.
pub(crate) fn menu_items(view: &TimerView) -> Vec<&'static str> {
    match view.mode {
        Mode::Focus => vec![PAUSE, END_SESSION, SHOW, SETTINGS, QUIT],
        Mode::Paused => vec![RESUME, END_SESSION, SHOW, SETTINGS, QUIT],
        Mode::Idle => vec![SHOW, SETTINGS, QUIT],
    }
}

/// What the menu bar shows.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Drawn {
    title: Option<String>,
    label: String,
    glyph: Glyph,
    items: Vec<&'static str>,
}

impl Drawn {
    fn of(view: &TimerView) -> Drawn {
        let (title, glyph) = tray_title_and_icon(view);
        Drawn {
            title,
            label: tray_label(view),
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
    /// Runs `task` on a background thread after [`RETRY_DELAY`], so a failed draw is not
    /// retried back to back on the main thread. Tests hold the task instead of sleeping.
    fn after_delay(&self, task: Box<dyn FnOnce() + Send>) -> Result<(), String>;
    fn set_title(&self, title: Option<&str>) -> Result<(), String>;
    fn set_tooltip(&self, label: &str) -> Result<(), String>;
    /// Sets the spoken name VoiceOver reads for the item (#107).
    fn set_accessibility_label(&self, label: &str) -> Result<(), String>;
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
    /// Draws posted again for the current `wanted` after a failure.
    retries: u32,
    /// Counts renders. A delayed retry carries the number it was scheduled under and is
    /// dropped when a newer render has come since (newest wins).
    render_seq: u64,
}

/// How many times a failed draw is posted again for one view.
pub(crate) const DRAW_RETRIES: u32 = 3;

/// How long a failed draw waits before it is posted again.
const RETRY_DELAY: Duration = Duration::from_millis(250);

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
                retries: 0,
                render_seq: 0,
            })),
        }
    }
}

fn lock_state(state: &Mutex<TrayState>) -> MutexGuard<'_, TrayState> {
    state.lock().unwrap_or_else(PoisonError::into_inner)
}

impl NativeSurface for Tray {
    fn render(&self, view: &TimerView) {
        {
            let mut state = lock_state(&self.state);
            state.wanted = Some(Drawn::of(view));
            state.retries = 0;
            state.render_seq += 1;
        }
        post_draw(&self.handle, &self.state);
    }
}

/// Posts one [`draw`] to the main thread, without waiting for it.
fn post_draw(handle: &Arc<dyn TrayHandle>, state: &Arc<Mutex<TrayState>>) {
    let task_handle = Arc::clone(handle);
    let state = Arc::clone(state);
    let posted = handle.on_main_thread(Box::new(move || draw(&task_handle, &state)));
    if let Err(error) = posted {
        eprintln!("tray: could not reach the main thread: {error}");
    }
}

/// On the main thread: take the wanted state under the lock, release it, then make the calls.
fn draw(handle: &Arc<dyn TrayHandle>, state: &Arc<Mutex<TrayState>>) {
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
    if drawn.as_ref().map(|d| &d.label) != Some(&wanted.label) {
        ok &= report("set_tooltip", handle.set_tooltip(&wanted.label));
        ok &= report(
            "set_accessibility_label",
            handle.set_accessibility_label(&wanted.label),
        );
    }
    if drawn.as_ref().map(|d| d.glyph) != Some(wanted.glyph) {
        ok &= report("set_icon", handle.set_glyph(wanted.glyph));
    }
    // The menu is rebuilt only when the state class changes (idle, running, paused).
    if drawn.as_ref().map(|d| &d.items) != Some(&wanted.items) {
        ok &= report("set_menu", handle.set_menu(&wanted.items));
    }
    if ok {
        let mut state = lock_state(state);
        state.drawn = Some(wanted);
        return;
    }
    let (newer, retry) = {
        let mut state = lock_state(state);
        // A newer view's draw is already posted and redoes everything (`drawn` is `None`).
        let newer = state.wanted.is_some();
        let retry = !newer && state.retries < DRAW_RETRIES;
        if retry {
            state.retries += 1;
            state.wanted = Some(wanted);
        }
        (newer, retry.then_some(state.render_seq))
    };
    if let Some(seq) = retry {
        eprintln!("tray: drawing the menu-bar item again shortly");
        schedule_retry(handle, state, seq);
    } else if !newer {
        eprintln!("tray: gave up drawing this view; the next view redraws everything");
    }
}

/// Posts the draw again after [`RETRY_DELAY`], unless a newer render has come since `seq`
/// (its own draw, and its own retries, redo everything).
fn schedule_retry(handle: &Arc<dyn TrayHandle>, state: &Arc<Mutex<TrayState>>, seq: u64) {
    let task_handle = Arc::clone(handle);
    let task_state = Arc::clone(state);
    let scheduled = handle.after_delay(Box::new(move || {
        let current = lock_state(&task_state).render_seq == seq;
        if current {
            post_draw(&task_handle, &task_state);
        }
    }));
    if let Err(error) = scheduled {
        eprintln!("tray: could not schedule the retry ({error}); the next view redraws everything");
    }
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
    Settings,
    Quit,
}

/// The command for a menu item id; `None` for ids that are not the tray's.
pub(crate) fn menu_command(id: &str) -> Option<MenuCommand> {
    match id {
        PAUSE => Some(MenuCommand::Session(Action::Pause)),
        RESUME => Some(MenuCommand::Session(Action::Resume)),
        END_SESSION => Some(MenuCommand::Session(Action::Stop)),
        SHOW => Some(MenuCommand::Show),
        SETTINGS => Some(MenuCommand::Settings),
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
        Some(MenuCommand::Settings) => lifecycle::show_settings(app),
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

    fn after_delay(&self, task: Box<dyn FnOnce() + Send>) -> Result<(), String> {
        thread::Builder::new()
            .name("tray-retry".into())
            .spawn(move || {
                thread::sleep(RETRY_DELAY);
                task();
            })
            .map(drop)
            .map_err(|error| error.to_string())
    }

    fn set_title(&self, title: Option<&str>) -> Result<(), String> {
        self.icon
            .set_title(title)
            .map_err(|error| error.to_string())
    }

    fn set_tooltip(&self, label: &str) -> Result<(), String> {
        self.icon
            .set_tooltip(Some(label))
            .map_err(|error| error.to_string())
    }

    /// `with_inner_tray_icon` runs the closure inline here, since `draw` is on the main thread.
    #[cfg(target_os = "macos")]
    fn set_accessibility_label(&self, label: &str) -> Result<(), String> {
        let label = label.to_string();
        self.icon
            .with_inner_tray_icon(move |tray| match tray.ns_status_item() {
                Some(item) => {
                    orasenda_platform_macos::set_status_item_accessibility_label(&item, &label)
                        .map_err(|error| error.to_string())
                }
                None => Err("no status item".to_string()),
            })
            .map_err(|error| error.to_string())?
    }

    /// Other desktops read the tooltip as the item's name; there is nothing more to set.
    #[cfg(not(target_os = "macos"))]
    fn set_accessibility_label(&self, _label: &str) -> Result<(), String> {
        Ok(())
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

/// The native menu: the session items, a separator, then *Show* and *Settings…*, a separator, then *Quit*.
fn build_menu(app: &AppHandle, items: &[&'static str]) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    for (index, label) in items.iter().enumerate() {
        if (*label == SHOW && index > 0) || *label == QUIT {
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
        .tooltip(tray_label(&idle))
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| on_menu_event(app, event.id().as_ref()))
        .build(app)?;
    let tauri_tray = Arc::new(TauriTray {
        app: handle.clone(),
        icon,
    });
    // The builder takes no accessibility label, so the idle item gets it here, on the main
    // thread like every tray call.
    let labelled = report(
        "set_accessibility_label",
        tauri_tray.set_accessibility_label(&tray_label(&idle)),
    );
    let tray = Tray::new(tauri_tray, &idle);
    if !labelled {
        // The first render then redoes every call, the label included.
        lock_state(&tray.state).drawn = None;
    }
    let tray: Arc<dyn NativeSurface> = Arc::new(tray);
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

    use orasenda_core::{EngineState, NotificationStatus, format_remaining, spoken_remaining};

    use super::*;
    use crate::ipc::StoreStatus;

    /// 24:59, 24:58 and 24:57 left.
    const S59: u64 = 1_499_000;
    const S58: u64 = 1_498_000;
    const S57: u64 = 1_497_000;

    fn idle() -> TimerView {
        TimerView::idle(StoreStatus::Ok, NotificationStatus::Granted)
    }

    fn running(remaining_ms: u64) -> TimerView {
        TimerView {
            state: EngineState::Running,
            mode: Mode::Focus,
            remaining_ms,
            remaining: format_remaining(remaining_ms),
            remaining_label: spoken_remaining(remaining_ms),
            ..idle()
        }
    }

    fn paused(remaining_ms: u64) -> TimerView {
        TimerView {
            state: EngineState::Paused,
            mode: Mode::Paused,
            ..running(remaining_ms)
        }
    }

    #[test]
    fn tray_title_and_icon_per_view() {
        assert_eq!(tray_title_and_icon(&idle()), (None, Glyph::Idle));
        assert_eq!(
            tray_title_and_icon(&running(S59)),
            (Some("24:59".to_string()), Glyph::Focus)
        );
        assert_eq!(
            tray_title_and_icon(&paused(754_000)),
            (Some("12:34".to_string()), Glyph::Paused)
        );
    }

    #[test]
    fn tray_label_per_view() {
        assert_eq!(tray_label(&idle()), "No session");
        assert_eq!(
            tray_label(&running(S59)),
            "Focus, 24 minutes 59 seconds remaining"
        );
        assert_eq!(
            tray_label(&paused(S59)),
            "Paused, 24 minutes 59 seconds remaining"
        );
    }

    #[test]
    fn menu_items_per_state() {
        assert_eq!(menu_items(&idle()), [SHOW, SETTINGS, QUIT]);
        assert_eq!(
            menu_items(&running(S59)),
            [PAUSE, END_SESSION, SHOW, SETTINGS, QUIT]
        );
        assert_eq!(
            menu_items(&paused(S59)),
            [RESUME, END_SESSION, SHOW, SETTINGS, QUIT]
        );
        assert_eq!(
            [PAUSE, RESUME, END_SESSION, SHOW, SETTINGS, QUIT],
            [
                "Pause",
                "Resume",
                "End session",
                "Show Orasenda",
                "Settings…",
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

    #[test]
    fn menu_command_settings() {
        assert!(matches!(
            menu_command(SETTINGS),
            Some(MenuCommand::Settings)
        ));
        assert!(menu_command("settings").is_none());
    }

    #[derive(Debug, Clone, PartialEq)]
    enum Call {
        Title(Option<String>),
        Tooltip(String),
        AccessibilityLabel(String),
        Glyph(Glyph),
        Menu(Vec<&'static str>),
    }

    fn title(text: &str) -> Call {
        Call::Title(Some(text.into()))
    }

    fn tooltip(view: &TimerView) -> Call {
        Call::Tooltip(tray_label(view))
    }

    fn accessibility_label(view: &TimerView) -> Call {
        Call::AccessibilityLabel(tray_label(view))
    }

    /// Records the calls. Each call asserts `Tray`'s lock is free. With `queued`, main-thread
    /// tasks wait in a queue until the test runs them, like posts from another thread.
    #[derive(Default)]
    struct Recorder {
        calls: Mutex<Vec<Call>>,
        state: OnceLock<Arc<Mutex<TrayState>>>,
        queued: bool,
        queue: Mutex<VecDeque<Box<dyn FnOnce() + Send>>>,
        /// Tasks handed to `after_delay`, held until the test runs them (no sleeps).
        delayed: Mutex<VecDeque<Box<dyn FnOnce() + Send>>>,
        /// How many of the next `set_title` calls fail.
        title_failures: Mutex<u32>,
        /// How many of the next `set_accessibility_label` calls fail.
        label_failures: Mutex<u32>,
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

        /// Runs the oldest delayed task, as if its delay had passed. False when none waits.
        fn run_delayed(&self) -> bool {
            let task = self.delayed.lock().unwrap().pop_front();
            task.map(|task| task()).is_some()
        }

        fn delayed_count(&self) -> usize {
            self.delayed.lock().unwrap().len()
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

        fn after_delay(&self, task: Box<dyn FnOnce() + Send>) -> Result<(), String> {
            self.delayed.lock().unwrap().push_back(task);
            Ok(())
        }

        fn set_title(&self, title: Option<&str>) -> Result<(), String> {
            self.record(Call::Title(title.map(str::to_string)));
            let mut failures = self.title_failures.lock().unwrap();
            if *failures > 0 {
                *failures -= 1;
                return Err("no status item".into());
            }
            Ok(())
        }

        fn set_tooltip(&self, label: &str) -> Result<(), String> {
            self.record(Call::Tooltip(label.into()));
            Ok(())
        }

        fn set_accessibility_label(&self, label: &str) -> Result<(), String> {
            self.record(Call::AccessibilityLabel(label.into()));
            let mut failures = self.label_failures.lock().unwrap();
            if *failures > 0 {
                *failures -= 1;
                return Err("status item has no button".into());
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

    fn tray_with(recorder: Recorder) -> (Arc<Tray>, Arc<Recorder>) {
        let recorder = Arc::new(recorder);
        let tray = Arc::new(Tray::new(recorder.clone(), &idle()));
        recorder.state.set(Arc::clone(&tray.state)).ok().unwrap();
        (tray, recorder)
    }

    /// Everything a draw from the idle item to `view` calls.
    fn full_draw(view: &TimerView) -> Vec<Call> {
        let drawn = Drawn::of(view);
        vec![
            Call::Title(drawn.title),
            Call::Tooltip(drawn.label.clone()),
            Call::AccessibilityLabel(drawn.label),
            Call::Glyph(drawn.glyph),
            Call::Menu(drawn.items),
        ]
    }

    #[test]
    fn tray_render_skips_set_menu_when_class_unchanged() {
        let (tray, calls) = tray_with(Recorder::default());

        tray.render(&running(S59));
        assert_eq!(calls.take(), full_draw(&running(S59)));

        // A tick costs one `set_title`, one `set_tooltip` and one `set_accessibility_label`.
        tray.render(&running(S58));
        assert_eq!(
            calls.take(),
            [
                title("24:58"),
                tooltip(&running(S58)),
                accessibility_label(&running(S58)),
            ]
        );

        // The same view again (a focus republish) costs nothing.
        tray.render(&running(S58));
        assert_eq!(calls.take(), []);

        tray.render(&paused(S58));
        assert_eq!(
            calls.take(),
            [
                tooltip(&paused(S58)),
                accessibility_label(&paused(S58)),
                Call::Glyph(Glyph::Paused),
                Call::Menu(vec![RESUME, END_SESSION, SHOW, SETTINGS, QUIT]),
            ]
        );

        tray.render(&running(S58));
        assert_eq!(
            calls.take(),
            [
                tooltip(&running(S58)),
                accessibility_label(&running(S58)),
                Call::Glyph(Glyph::Focus),
                Call::Menu(vec![PAUSE, END_SESSION, SHOW, SETTINGS, QUIT]),
            ]
        );

        tray.render(&idle());
        assert_eq!(
            calls.take(),
            [
                Call::Title(None),
                Call::Tooltip("No session".into()),
                Call::AccessibilityLabel("No session".into()),
                Call::Glyph(Glyph::Idle),
                Call::Menu(vec![SHOW, SETTINGS, QUIT]),
            ]
        );
    }

    /// Two renders from two threads whose draws reach the main thread later: the menu bar
    /// ends on the last view, and the next identical render costs nothing.
    #[test]
    fn queued_renders_draw_the_latest_view_once() {
        let (tray, calls) = tray_with(Recorder {
            queued: true,
            ..Recorder::default()
        });
        tray.render(&running(S59));
        tray.render(&paused(S59));
        assert_eq!(calls.take(), [], "render itself makes no tray call");

        calls.run_queue();
        assert_eq!(calls.take(), full_draw(&paused(S59)));

        tray.render(&paused(S59));
        calls.run_queue();
        assert_eq!(calls.take(), []);
    }

    /// A failed call is logged and the draw is posted again after a delay, redoing every
    /// call. The main thread runs posts inline here, as Tauri does when already on it: the
    /// retry still waits for its delay instead of running back to back.
    #[test]
    fn failed_tray_call_is_retried_without_a_new_render() {
        let (tray, calls) = tray_with(Recorder::default());
        tray.render(&running(S59));
        calls.take();

        // While idle no further render comes, so the retry is the only way back.
        *calls.title_failures.lock().unwrap() = 1;
        tray.render(&idle());
        assert_eq!(
            calls.take(),
            full_draw(&idle()),
            "no retry before the delay"
        );
        assert_eq!(calls.delayed_count(), 1);
        assert!(calls.run_delayed());
        assert_eq!(calls.take(), full_draw(&idle()));
        assert_eq!(calls.delayed_count(), 0);

        tray.render(&idle());
        assert_eq!(calls.take(), []);
    }

    /// A failed accessibility label fails the draw like any other call: the retry sets it
    /// again, so VoiceOver is not left reading the previous view's name.
    #[test]
    fn failed_accessibility_label_is_retried_without_a_new_render() {
        let (tray, calls) = tray_with(Recorder::default());
        tray.render(&running(S59));
        calls.take();

        *calls.label_failures.lock().unwrap() = 1;
        tray.render(&idle());
        assert!(calls.run_delayed());
        let mut expected = full_draw(&idle());
        expected.extend(full_draw(&idle()));
        assert_eq!(calls.take(), expected);

        tray.render(&idle());
        assert_eq!(calls.take(), []);
    }

    /// A tray that keeps failing is tried once plus [`DRAW_RETRIES`] times per view, then
    /// left until the next view.
    #[test]
    fn failed_draw_retries_are_bounded() {
        let (tray, calls) = tray_with(Recorder {
            title_failures: Mutex::new(u32::MAX),
            ..Recorder::default()
        });
        tray.render(&running(S59));
        while calls.run_delayed() {}
        let titles = calls
            .take()
            .iter()
            .filter(|call| matches!(call, Call::Title(_)))
            .count();
        assert_eq!(titles, 1 + DRAW_RETRIES as usize);

        *calls.title_failures.lock().unwrap() = 0;
        tray.render(&running(S57));
        assert_eq!(calls.take(), full_draw(&running(S57)));
    }

    /// A retry that finds a newer view waiting leaves the drawing to that view's own draw.
    #[test]
    fn failed_draw_does_not_retry_over_a_newer_view() {
        let (tray, calls) = tray_with(Recorder {
            queued: true,
            title_failures: Mutex::new(1),
            ..Recorder::default()
        });
        tray.render(&running(S59));
        // The first draw fails; before the retry runs, a newer view arrives.
        let first = calls.queue.lock().unwrap().pop_front().unwrap();
        first();
        tray.render(&running(S58));
        calls.run_queue();
        while calls.run_delayed() {
            calls.run_queue();
        }
        let mut expected = full_draw(&running(S59));
        expected.extend(full_draw(&running(S58)));
        assert_eq!(calls.take(), expected);
    }

    /// A delayed retry for an older view is dropped once a newer view has rendered, even
    /// when that newer view's draw failed too: only the newer view's own retry draws, so
    /// the older retry neither draws early nor uses up the newer view's attempts.
    #[test]
    fn delayed_retry_for_an_older_view_is_dropped() {
        let (tray, calls) = tray_with(Recorder {
            title_failures: Mutex::new(2),
            ..Recorder::default()
        });
        tray.render(&running(S59));
        tray.render(&running(S58));
        calls.take();
        assert_eq!(calls.delayed_count(), 2);

        assert!(calls.run_delayed(), "the older view's retry");
        assert_eq!(calls.take(), [], "the older retry is dropped");
        assert!(calls.run_delayed(), "the newer view's retry");
        assert_eq!(calls.take(), full_draw(&running(S58)));
        assert_eq!(
            lock_state(&tray.state).drawn,
            Some(Drawn::of(&running(S58)))
        );
    }

    /// Through `publish_view`: idle, then a stale running view (an older number) leaves the
    /// tray idle with no title.
    #[test]
    fn stale_view_through_the_gate_leaves_the_tray_idle() {
        use crate::scheduler::publish_view;
        use crate::session::test_support::TestHost;

        let host = TestHost::new(NotificationStatus::Granted);
        let (tray, calls) = tray_with(Recorder::default());
        host.0
            .surfaces
            .0
            .lock()
            .unwrap()
            .push(Arc::clone(&tray) as Arc<dyn NativeSurface>);

        publish_view(&host, 1, &running(S59));
        publish_view(&host, 3, &idle());
        calls.take();
        publish_view(&host, 2, &running(S58));
        assert_eq!(calls.take(), []);
        assert_eq!(
            lock_state(&tray.state).drawn,
            Some(Drawn::of(&idle())),
            "the tray stays idle"
        );
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
            fn after_delay(&self, task: Box<dyn FnOnce() + Send>) -> Result<(), String> {
                self.inner.after_delay(task)
            }
            fn set_title(&self, title: Option<&str>) -> Result<(), String> {
                if title == Some("24:59")
                    && let Some(tray) = self.tray.get().and_then(std::sync::Weak::upgrade)
                {
                    tray.render(&running(S58));
                }
                self.inner.set_title(title)
            }
            fn set_tooltip(&self, label: &str) -> Result<(), String> {
                self.inner.set_tooltip(label)
            }
            fn set_accessibility_label(&self, label: &str) -> Result<(), String> {
                self.inner.set_accessibility_label(label)
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
                tray.render(&running(S59));
                done.send(()).unwrap();
            })
        };
        finished
            .recv_timeout(std::time::Duration::from_secs(5))
            .expect("rendered without deadlock");
        worker.join().unwrap();
        assert!(handle.inner.take().contains(&title("24:58")));
    }
}
