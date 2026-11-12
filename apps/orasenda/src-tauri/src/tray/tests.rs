//! Tests for the menu-bar item: view mapping, menu commands and the draw with its retries.

use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};

use orasenda_core::{EngineState, NotificationStatus, format_remaining, spoken_remaining};

use super::state::{DRAW_RETRIES, Drawn, TrayState};
use super::*;
use crate::ipc::{Mode, StoreStatus};

mod focus_items;
mod header;
mod menu_items;
mod presets;
mod retry;

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

#[derive(Debug, Clone, PartialEq)]
enum Call {
    Title(Option<String>),
    Tooltip(String),
    AccessibilityLabel(String),
    Glyph(Glyph),
    Menu(Vec<MenuEntry>, Option<String>),
    Header(String),
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

    fn set_menu(&self, items: &[MenuEntry], header: Option<&str>) -> Result<(), String> {
        self.record(Call::Menu(items.to_vec(), header.map(str::to_string)));
        Ok(())
    }

    fn set_header(&self, text: &str) -> Result<(), String> {
        self.record(Call::Header(text.into()));
        Ok(())
    }
}

fn tray_with(recorder: Recorder) -> (Arc<Tray>, Arc<Recorder>) {
    let recorder = Arc::new(recorder);
    let tray = Arc::new(Tray::new(recorder.clone(), &idle(), NextSession::default()));
    recorder.state.set(Arc::clone(&tray.state)).ok().unwrap();
    (tray, recorder)
}

/// Everything a draw from the idle item to `view` calls.
fn full_draw(view: &TimerView) -> Vec<Call> {
    let drawn = Drawn::of(view, &NextSession::default(), &FocusItems::default());
    vec![
        Call::Title(drawn.title),
        Call::Tooltip(drawn.label.clone()),
        Call::AccessibilityLabel(drawn.label),
        Call::Glyph(drawn.glyph),
        Call::Menu(drawn.items, drawn.header),
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
            Call::Menu(
                menu_items(
                    &paused(S58),
                    &NextSession::default(),
                    &FocusItems::default(),
                    false
                ),
                header_text(&paused(S58)),
            ),
        ]
    );

    tray.render(&running(S58));
    assert_eq!(
        calls.take(),
        [
            tooltip(&running(S58)),
            accessibility_label(&running(S58)),
            Call::Glyph(Glyph::Focus),
            Call::Menu(
                menu_items(
                    &running(S58),
                    &NextSession::default(),
                    &FocusItems::default(),
                    false
                ),
                header_text(&running(S58)),
            ),
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
            Call::Menu(
                menu_items(
                    &idle(),
                    &NextSession::default(),
                    &FocusItems::default(),
                    false
                ),
                None
            ),
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
