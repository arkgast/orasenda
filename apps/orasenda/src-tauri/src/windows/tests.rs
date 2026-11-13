//! The window specs and the open and close steps, against a recording fake of the platform.

use std::cell::RefCell;

use orasenda_core::NotificationStatus;
use orasenda_service::session::test_support::TestHost;
use orasenda_service::session::{run_frame_load, run_frame_save};
use orasenda_service::windows::Frame;

use super::floater::{self, LIMITS, close_floater_on, floater_window_spec, open_floater_on};
use super::focus::{self, focus_label, focus_window_spec, insets_of, open_focus_on};
use super::frames::{DEBOUNCE_MS, Trailing};
use super::{FLOATER, Ops, Screen, WindowSpec};
use crate::ipc::{FocusInsets, FocusViewError, FocusViewErrorKind};
mod displays;
const NO_INSETS: FocusInsets = FocusInsets {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
};

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
        insets: insets_of((width, height), visible),
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
    fn focus_labels(&self) -> Vec<String> {
        let mut all = self.windows.borrow().clone();
        all.retain(|l| l.starts_with("focus-"));
        all
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
    fn cover_display(&self, label: &str, display_id: &str) -> Result<(), FocusViewError> {
        self.step(&format!("cover {label} {display_id}"))
    }
    fn make_floater(&self, label: &str) -> Result<(), FocusViewError> {
        self.step(&format!("make_floater {label}"))
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
    fn emit_insets(&self, label: &str, _insets: FocusInsets) {
        self.calls.borrow_mut().push(format!("insets {label}"));
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
fn focus_window_spec_matches_spec() {
    let spec = focus_window_spec(
        "1234",
        (1440, 900),
        FocusInsets {
            top: 24,
            right: 0,
            bottom: 60,
            left: 0,
        },
    );
    assert_eq!(spec.label, "focus-1234");
    assert_eq!(spec.page, "focus.html?display=1234&insets=24,0,60,0");
    assert!(!spec.decorations && !spec.resizable && spec.skip_taskbar && !spec.visible);
    assert_eq!((spec.width, spec.height), (1440.0, 900.0));
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
fn focus_label_is_valid_for_any_display_id() {
    for id in [
        "69732992",
        "a-b",
        "i0",
        "",
        "---",
        "é ü/..:x",
        "a--b",
        "-lead",
        "trail-",
    ] {
        let label = focus_label(id);
        assert!(
            label.starts_with("focus-") && label.len() > "focus-".len(),
            "{id:?} -> {label}"
        );
        assert!(
            label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'),
            "{label}"
        );
        assert!(!label.ends_with('-') && !label.contains("--"), "{label}");
    }
    assert_eq!(focus_label("69732992"), "focus-69732992");
}

#[test]
fn insets_are_the_menu_bar_and_dock() {
    assert_eq!(
        insets_of((1440, 900), rect(0, 24, 1440, 816)),
        FocusInsets {
            top: 24,
            right: 0,
            bottom: 60,
            left: 0
        }
    );
    assert_eq!(insets_of((100, 100), rect(0, 0, 200, 200)), NO_INSETS);
}

#[test]
fn focus_view_open_unknown_display_is_no_display() {
    let ops = Fake::new(vec![screen("1", 1440, 900)]);
    let error = open_focus_on(&ops, "nope").unwrap_err();
    assert_eq!(error.kind, FocusViewErrorKind::NoDisplay);
    assert!(ops.calls().is_empty(), "no window was touched");
}

#[test]
fn focus_view_open_creates_frames_then_shows() {
    let ops = Fake::new(vec![screen("1", 1440, 900)]);
    open_focus_on(&ops, "1").unwrap();
    assert_eq!(
        ops.calls(),
        vec![
            "create focus-1",
            "cover focus-1 1",
            "show focus-1",
            "focus focus-1",
            "insets focus-1"
        ]
    );
}

#[test]
fn focus_view_open_existing_window_is_focused_not_created() {
    let ops = Fake::new(vec![screen("1", 1440, 900)]);
    open_focus_on(&ops, "1").unwrap();
    open_focus_on(&ops, "1").unwrap();
    assert_eq!(ops.count("create"), 1);
    assert_eq!(ops.count("focus focus-1"), 2);
}

#[test]
fn focus_view_open_failed_frame_closes_the_window() {
    let mut ops = Fake::new(vec![screen("1", 1440, 900)]);
    ops.fail_on = Some("cover");
    assert!(open_focus_on(&ops, "1").is_err());
    assert!(!ops.exists("focus-1"));
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
fn focus_view_open_floater_twice_one_window() {
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
    open_focus_on(&ops, "1").unwrap();
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

#[test]
fn frame_debounce_trailing_500ms() {
    let mut trailing = Trailing::default();
    assert_eq!(
        trailing.touch(1_000),
        Some(1_000 + DEBOUNCE_MS),
        "the first move arms one wake-up"
    );
    for at in [1_050, 1_200, 1_499] {
        assert_eq!(
            trailing.touch(at),
            None,
            "moves inside the window schedule nothing"
        );
        assert!(!trailing.due(at));
    }
    assert!(!trailing.due(1_499));
    assert!(trailing.due(1_500), "one save, 500 ms after the first move");
    assert!(!trailing.due(1_501), "and only one");
    assert_eq!(
        trailing.touch(1_600),
        Some(2_100),
        "the next burst arms again"
    );
}

#[test]
fn floater_close_drops_the_pending_trailing_save() {
    let mut trailing = Trailing::default();
    trailing.touch(0);
    trailing.cancel();
    assert!(
        !trailing.due(10_000),
        "the pending trailing save is dropped"
    );
}

#[test]
fn focus_view_close_refused_for_main() {
    use crate::commands::closable;
    assert_eq!(
        closable("main").unwrap_err().kind,
        FocusViewErrorKind::Unavailable
    );
    assert!(closable("floater").is_ok());
    assert!(closable("focus-1").is_ok());
}
