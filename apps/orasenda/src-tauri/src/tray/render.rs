//! Drawing a view on the menu bar: glyph, title and label, and the draw with its retries.

use std::sync::{Arc, Mutex};

use tauri::image::Image;

use super::menu::{MenuEntry, NextSession};
use super::state::{DRAW_RETRIES, Drawn, TrayState, lock_state};
use crate::ipc::{Mode, TimerView};
use crate::ipc::{PresetEntry, Settings};
use crate::runtime::session::NativeSurface;

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
    pub(super) fn image(self) -> Image<'static> {
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
        // Until the menu-bar task draws them, a break and the warning look like a focus.
        Mode::Focus | Mode::Break | Mode::Warning => (Some(view.remaining.clone()), Glyph::Focus),
        Mode::Paused => (Some(view.remaining.clone()), Glyph::Paused),
        Mode::Idle => (None, Glyph::Idle),
    }
}

/// The item's spoken name (design system `MenuBarTimer`, "Menu-bar glyphs"): the mode word
/// and `remainingLabel`, or "No session" when idle. Set as the tooltip and accessibility label.
pub(crate) fn tray_label(view: &TimerView) -> String {
    let mode = match view.mode {
        Mode::Focus | Mode::Break | Mode::Warning => "Focus",
        Mode::Paused => "Paused",
        Mode::Idle => return "No session".to_string(),
    };
    format!("{mode}, {} remaining", view.remaining_label)
}

/// The disabled status header at the top of the running and paused menus, or `None` when
/// idle: "Focus · 18 minutes left · ends 15:20", "Paused · 18 minutes left". The minutes
/// round up, and one reads "1 minute left". It changes at most once a minute.
pub(crate) fn header_text(view: &TimerView) -> Option<String> {
    let mode = match view.mode {
        Mode::Focus | Mode::Break | Mode::Warning => "Focus",
        Mode::Paused => "Paused",
        Mode::Idle => return None,
    };
    let minutes = view.remaining_ms.div_ceil(60_000).max(1);
    let left = if minutes == 1 {
        "1 minute left".to_string()
    } else {
        format!("{minutes} minutes left")
    };
    Some(match (&view.mode, &view.finish) {
        (Mode::Focus | Mode::Break | Mode::Warning, Some(finish)) => {
            format!("{mode} · {left} · ends {finish}")
        }
        _ => format!("{mode} · {left}"),
    })
}

/// The tray calls [`Tray`] makes, behind a small trait so the render logic is tested with a
/// recording fake.
pub(crate) trait TrayHandle: Send + Sync + 'static {
    /// Runs `task` on the main thread: inline when called there, else posted without waiting.
    fn on_main_thread(&self, task: Box<dyn FnOnce() + Send>) -> Result<(), String>;
    /// Runs `task` on a background thread after [`RETRY_DELAY`](super::state::RETRY_DELAY), so a failed draw is not
    /// retried back to back on the main thread. Tests hold the task instead of sleeping.
    fn after_delay(&self, task: Box<dyn FnOnce() + Send>) -> Result<(), String>;
    fn set_title(&self, title: Option<&str>) -> Result<(), String>;
    fn set_tooltip(&self, label: &str) -> Result<(), String>;
    /// Sets the spoken name VoiceOver reads for the item (#107).
    fn set_accessibility_label(&self, label: &str) -> Result<(), String>;
    /// Swaps the glyph, keeping it a template image.
    fn set_glyph(&self, glyph: Glyph) -> Result<(), String>;
    /// Replaces the menu; `header` is the text of the [`MenuEntry::Header`] item, if any.
    fn set_menu(&self, items: &[MenuEntry], header: Option<&str>) -> Result<(), String>;
    /// Changes the status header's text in place, without rebuilding the menu.
    fn set_header(&self, text: &str) -> Result<(), String>;
}

/// The menu-bar item as a [`NativeSurface`].
pub struct Tray {
    handle: Arc<dyn TrayHandle>,
    pub(super) state: Arc<Mutex<TrayState>>,
}

impl Tray {
    /// A tray whose item already shows `shown` (the idle item `setup` builds).
    pub(super) fn new(handle: Arc<dyn TrayHandle>, shown: &TimerView, next: NextSession) -> Tray {
        Tray {
            handle,
            state: Arc::new(Mutex::new(TrayState {
                wanted: None,
                drawn: Some(Drawn::of(shown, &next)),
                view: shown.clone(),
                next,
                retries: 0,
                render_seq: 0,
            })),
        }
    }
}

impl NativeSurface for Tray {
    fn render(&self, view: &TimerView) {
        {
            let mut state = lock_state(&self.state);
            state.view = view.clone();
            state.wanted = Some(Drawn::of(view, &state.next));
            state.retries = 0;
            state.render_seq += 1;
        }
        post_draw(&self.handle, &self.state);
    }

    /// The idle menu follows the saved preset: the Start minutes and the checked item.
    fn settings_changed(&self, settings: &Settings) {
        {
            let mut state = lock_state(&self.state);
            state.next = state.next.with_settings(settings);
            // The menu toggles a check item itself when clicked, so what it shows may differ
            // from `drawn` even when the settings did not: always rebuild it.
            if let Some(drawn) = state.drawn.as_mut() {
                drawn.items.clear();
            }
            state.wanted = Some(Drawn::of(&state.view, &state.next));
            state.retries = 0;
            state.render_seq += 1;
        }
        post_draw(&self.handle, &self.state);
    }

    /// The library changed: the Preset submenu is rebuilt from the new list.
    fn presets_changed(&self, presets: &[PresetEntry]) {
        {
            let mut state = lock_state(&self.state);
            state.next = state.next.with_presets(presets.to_vec());
            if let Some(drawn) = state.drawn.as_mut() {
                drawn.items.clear();
            }
            state.wanted = Some(Drawn::of(&state.view, &state.next));
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
    // The menu is rebuilt only when its item list changes; a new header text is set in place.
    if drawn.as_ref().map(|d| &d.items) != Some(&wanted.items) {
        ok &= report(
            "set_menu",
            handle.set_menu(&wanted.items, wanted.header.as_deref()),
        );
    } else if drawn.as_ref().map(|d| &d.header) != Some(&wanted.header)
        && let Some(text) = &wanted.header
    {
        ok &= report("set_header", handle.set_header(text));
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

/// Posts the draw again after [`RETRY_DELAY`](super::state::RETRY_DELAY), unless a newer render has come since `seq`
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
pub(super) fn report(call: &str, result: Result<(), String>) -> bool {
    match result {
        Ok(()) => true,
        Err(error) => {
            eprintln!("tray: {call} failed: {error}");
            false
        }
    }
}
