//! The window specs and the open and close steps, against a recording fake of the platform.

use std::cell::RefCell;

use orasenda_core::NotificationStatus;
use orasenda_service::session::test_support::TestHost;
use orasenda_service::session::{run_frame_load, run_frame_save};
use orasenda_service::windows::Frame;

use super::floater::{self, LIMITS, close_floater_on, floater_window_spec, open_floater_on};
use super::frames::{DEBOUNCE_MS, Trailing};
use super::{FLOATER, Ops, Screen, WindowSpec};
use crate::ipc::{FocusViewError, FocusViewErrorKind};
mod capture;
mod displays;
mod floater_toggle;
mod frames;
mod full_screen;

fn rect(x: i32, y: i32, width: u32, height: u32) -> Frame {
    Frame {
        x,
        y,
        width,
        height,
    }
}

fn screen(id: &str, width: u32, height: u32) -> Screen {
    let visible = rect(0, 24, width, height - 24 - 60);
    Screen {
        id: id.into(),
        legacy_id: id.into(),
        name: format!("Display {id}"),
        size: (width, height),
        visible,
    }
}

/// Records every call; windows exist while `windows` holds their label.
struct Fake {
    screens: Vec<Screen>,
    main: Option<String>,
    stored: Option<(String, Frame)>,
    host: Option<TestHost>,
    windows: RefCell<Vec<String>>,
    calls: RefCell<Vec<String>>,
    fail_on: Option<&'static str>,
    /// How many `exists` answers are false although the window is there (a lost race).
    blind: std::cell::Cell<u32>,
    on: Option<String>,
    /// `main` is in native full screen.
    full: std::cell::Cell<bool>,
}

impl Fake {
    fn new(screens: Vec<Screen>) -> Self {
        Self {
            screens,
            main: None,
            stored: None,
            host: None,
            windows: RefCell::new(Vec::new()),
            calls: RefCell::new(Vec::new()),
            fail_on: None,
            blind: std::cell::Cell::new(0),
            on: None,
            full: std::cell::Cell::new(false),
        }
    }

    fn step(&self, call: &str) -> Result<(), FocusViewError> {
        self.calls.borrow_mut().push(call.to_owned());
        if self.fail_on == Some(call.split(' ').next().unwrap_or("")) {
            return Err(FocusViewError::unavailable("fake failure"));
        }
        Ok(())
    }

    fn calls(&self) -> Vec<String> {
        self.calls.borrow().clone()
    }

    fn count(&self, prefix: &str) -> usize {
        self.calls()
            .iter()
            .filter(|c| c.starts_with(prefix))
            .count()
    }
}

impl Ops for Fake {
    fn screens(&self) -> Result<Vec<Screen>, FocusViewError> {
        Ok(self.screens.clone())
    }
    fn main_display(&self) -> Option<String> {
        self.main.clone()
    }
    fn exists(&self, label: &str) -> bool {
        if self.blind.get() > 0 {
            self.blind.set(self.blind.get() - 1);
            return false;
        }
        self.windows.borrow().iter().any(|l| l == label)
    }
    fn window_display(&self, _label: &str) -> Option<String> {
        let on = self.on.as_ref()?;
        self.screens.iter().any(|s| &s.id == on).then(|| on.clone())
    }
    fn create(&self, spec: &WindowSpec) -> Result<(), FocusViewError> {
        self.step(&format!("create {}", spec.label))?;
        if self.windows.borrow().contains(&spec.label) {
            return Err(FocusViewError::unavailable("exists"));
        }
        self.windows.borrow_mut().push(spec.label.clone());
        Ok(())
    }
    fn make_floater(&self, label: &str) -> Result<(), FocusViewError> {
        self.step(&format!("make_floater {label}"))
    }
    fn make_capture(&self, label: &str) -> Result<(), FocusViewError> {
        self.step(&format!("make_capture {label}"))
    }
    fn place_at_pointer(&self, label: &str, size: (u32, u32)) -> Result<(), FocusViewError> {
        self.step(&format!("place_at_pointer {label} {}x{}", size.0, size.1))
    }
    fn announce(&self, text: &str) -> Result<(), FocusViewError> {
        self.step(&format!("announce {text}"))
    }
    fn emit_capture_focus(&self) {
        self.calls.borrow_mut().push("capture_focus".to_owned());
    }
    fn place(&self, label: &str, display_id: &str, f: Frame) -> Result<(), FocusViewError> {
        self.step(&format!(
            "place {label} {display_id} {},{},{},{}",
            f.x, f.y, f.width, f.height
        ))
    }
    fn show(&self, label: &str) -> Result<(), FocusViewError> {
        self.step(&format!("show {label}"))
    }
    fn focus(&self, label: &str) -> Result<(), FocusViewError> {
        self.step(&format!("focus {label}"))
    }
    fn key(&self, label: &str) -> Result<(), FocusViewError> {
        self.step(&format!("key {label}"))
    }
    fn hide_main(&self) -> Result<(), FocusViewError> {
        self.step("hide_main")
    }
    fn main_full_screen(&self) -> bool {
        self.full.get()
    }
    fn migrate_frames(&self, screens: &[Screen]) {
        let pairs: Vec<String> = screens
            .iter()
            .map(|s| format!("{}>{}", s.legacy_id, s.id))
            .collect();
        self.calls
            .borrow_mut()
            .push(format!("migrate {}", pairs.join(",")));
    }
    fn load_frame(&self, displays: &[&str]) -> Option<(String, Frame)> {
        self.calls
            .borrow_mut()
            .push(format!("load_frame {}", displays.join(",")));
        match &self.host {
            // The real path: the store through the service's frame functions.
            Some(host) => run_frame_load(host, FLOATER, displays),
            None => self.stored.clone(),
        }
    }
    fn close(&self, label: &str) {
        self.calls.borrow_mut().push(format!("close {label}"));
        self.windows.borrow_mut().retain(|l| l != label);
    }
}

fn token_px(name: &str) -> u32 {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../packages/tokens/tokens.json");
    let tokens: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let mut found = None;
    collect(&tokens, name, &mut found);
    found.unwrap_or_else(|| panic!("no token {name}"))
}

fn collect(value: &serde_json::Value, name: &str, found: &mut Option<u32>) {
    match value {
        serde_json::Value::Object(map) => {
            if map.get("name").and_then(|n| n.as_str()) == Some(name)
                && let Some(text) = map.get("value").and_then(|v| v.as_str())
            {
                *found = text.trim_end_matches("px").parse().ok();
            }
            map.values().for_each(|v| collect(v, name, found));
        }
        serde_json::Value::Array(items) => items.iter().for_each(|v| collect(v, name, found)),
        _ => {}
    }
}

#[test]
fn floater_window_spec_uses_tokens() {
    let spec = floater_window_spec();
    assert_eq!(spec.label, "floater");
    assert_eq!(spec.page, "floater.html");
    assert_eq!(spec.width, f64::from(token_px("floater-width")));
    assert_eq!(spec.height, f64::from(token_px("floater-height")));
    assert_eq!(
        spec.min_size,
        Some((
            f64::from(token_px("floater-width")),
            f64::from(token_px("floater-min-height"))
        ))
    );
    assert_eq!(
        spec.max_size,
        Some((
            f64::from(token_px("floater-max-width")),
            f64::from(token_px("floater-max-height"))
        ))
    );
    assert_eq!(floater::EDGE_INSET, token_px("space-6"));
    assert_eq!(LIMITS.max_width, token_px("floater-max-width"));
    assert!(!spec.decorations && spec.skip_taskbar && !spec.visible);
}

#[test]
fn floater_opens_at_default_frame_on_the_main_display() {
    let mut ops = Fake::new(vec![screen("1", 1440, 900), screen("2", 1920, 1080)]);
    ops.main = Some("2".into());
    open_floater_on(&ops).unwrap();
    // Top-right of display 2's visible frame, 32 in from its edges: x = 1920 - 280 - 32.
    assert_eq!(
        ops.calls(),
        vec![
            "migrate 1>1,2>2",
            "load_frame 1,2",
            "create floater",
            "make_floater floater",
            "place floater 2 1608,56,280,64",
            "show floater",
            "key floater",
            "hide_main",
        ]
    );
}

#[test]
fn floater_opens_at_the_stored_frame_clamped() {
    let mut ops = Fake::new(vec![screen("1", 1440, 900)]);
    ops.stored = Some(("1".into(), rect(5000, 5000, 1000, 10)));
    open_floater_on(&ops).unwrap();
    // Clamped to the limits (360 by 56) and moved inside the visible frame.
    assert!(
        ops.calls()
            .contains(&"place floater 1 1080,784,360,56".to_owned()),
        "{:?}",
        ops.calls()
    );
    // A stored frame on a display that is gone falls back to the default frame.
    let mut gone = Fake::new(vec![screen("1", 1440, 900)]);
    gone.stored = Some(("9".into(), rect(0, 0, 280, 64)));
    open_floater_on(&gone).unwrap();
    assert!(
        gone.calls()
            .contains(&"place floater 1 1128,56,280,64".to_owned()),
        "{:?}",
        gone.calls()
    );
}

#[test]
fn floater_open_twice_one_window() {
    let ops = Fake::new(vec![screen("1", 1440, 900)]);
    open_floater_on(&ops).unwrap();
    open_floater_on(&ops).unwrap();
    assert_eq!(ops.count("create"), 1);
    assert_eq!(ops.windows.borrow().len(), 1);
    assert_eq!(ops.count("key floater"), 2);
    assert_eq!(ops.count("hide_main"), 2, "every open path hides main");
}

#[test]
fn floater_create_race_focuses_the_winner() {
    let ops = Fake::new(vec![screen("1", 1440, 900)]);
    ops.windows.borrow_mut().push(FLOATER.into());
    // The first `exists` misses the window (a second open is mid-create): create fails, then
    // the window exists, so the loser focuses it.
    ops.blind.set(1);
    open_floater_on(&ops).unwrap();
    assert_eq!(ops.count("create"), 1);
    assert_eq!(ops.count("key floater"), 1);
    assert_eq!(ops.count("hide_main"), 1);
}

#[test]
fn floater_failed_setup_closes_it_and_reports() {
    let mut ops = Fake::new(vec![screen("1", 1440, 900)]);
    ops.fail_on = Some("show");
    assert!(open_floater_on(&ops).is_err());
    assert!(!ops.exists(FLOATER));
    assert_eq!(
        ops.count("hide_main"),
        0,
        "main stays when the floater didn't open"
    );
}

#[test]
fn close_floater_closes_only_when_shown() {
    let ops = Fake::new(vec![screen("1", 1440, 900)]);
    close_floater_on(&ops);
    assert_eq!(ops.count("close"), 0);
    open_floater_on(&ops).unwrap();
    close_floater_on(&ops);
    assert!(!ops.exists(FLOATER));
}

#[test]
fn open_close_never_touch_session() {
    let host = TestHost::new(NotificationStatus::Granted);
    let mut ops = Fake::new(vec![screen("1", 1440, 900)]);
    ops.host = Some(host.clone());
    // A remembered frame goes through the same service functions the windows module uses.
    run_frame_save(&host, FLOATER, "1", rect(100, 100, 280, 64));
    open_floater_on(&ops).unwrap();
    open_floater_on(&ops).unwrap();
    close_floater_on(&ops);
    assert!(ops.count("load_frame") >= 1);
    let events = host.log().take();
    assert!(
        events.is_empty(),
        "no tick, milestone, settings or theme was published: {}",
        events.len()
    );
}
