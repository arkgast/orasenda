//! The floater's toggle and the window half of `actions::run`, against the recording fake.

use super::*;
use crate::actions::{Outcome, Route, WindowRoute, perform_on, route};
use crate::windows::floater::{Toggled, toggle_floater_on};
use orasenda_service::keyboard::ActionId;

fn fake() -> Fake {
    Fake::new(vec![screen("a", 1440, 900), screen("b", 1920, 1080)])
}

#[test]
fn floater_toggle_from_main() {
    let ops = fake();
    assert_eq!(toggle_floater_on(&ops).unwrap(), Toggled::Opened);
    let calls = ops.calls();
    assert!(calls.contains(&"create floater".to_owned()));
    assert_eq!(calls.last().unwrap(), "hide_main", "main hides last");
    assert_eq!(ops.count("close"), 0);
}

#[test]
fn floater_toggle_back_from_floater() {
    let ops = fake();
    toggle_floater_on(&ops).unwrap();
    let before = ops.calls().len();
    assert_eq!(toggle_floater_on(&ops).unwrap(), Toggled::Closed);
    let calls = ops.calls()[before..].to_vec();
    assert_eq!(calls, ["show main", "focus main", "close floater"]);
    assert!(!ops.exists("floater"));
}

#[test]
fn capture_press_opens_panel() {
    // The capture key (global, menu or tray) is the capture route, and it opens the panel.
    assert_eq!(
        route(ActionId::Capture),
        Route::Window(WindowRoute::Capture)
    );
    let ops = fake();
    assert_eq!(
        perform_on(&ops, WindowRoute::Capture).unwrap(),
        Outcome::Done
    );
    assert_eq!(ops.count("create capture"), 1);
    assert_eq!(ops.count("show capture"), 1);
    assert_eq!(ops.count("key capture"), 1);
}

#[test]
fn full_screen_ids_route_to_focus_window() {
    assert_eq!(
        route(ActionId::FullScreen),
        Route::Window(WindowRoute::FocusWindow { other: false })
    );
    assert_eq!(
        route(ActionId::FullScreenOther),
        Route::Window(WindowRoute::FocusWindow { other: true })
    );
    assert_eq!(
        route(ActionId::LeaveFullScreen),
        Route::Window(WindowRoute::LeaveFocusWindow)
    );
    // The main window's display is the first one; "other" is the next display.
    let mut ops = fake();
    ops.main = Some("a".into());
    let route = WindowRoute::FocusWindow { other: false };
    assert_eq!(perform_on(&ops, route).unwrap(), Outcome::FocusOpened);
    assert_eq!(ops.count("create focus-a"), 1);
    let route = WindowRoute::FocusWindow { other: true };
    assert_eq!(perform_on(&ops, route).unwrap(), Outcome::FocusOpened);
    assert_eq!(ops.count("create focus-b"), 1);
    assert_eq!(
        perform_on(&ops, WindowRoute::LeaveFocusWindow).unwrap(),
        Outcome::Done
    );
    assert!(ops.focus_labels().is_empty());
}

#[test]
fn full_screen_other_without_a_second_display_says_so() {
    let mut ops = Fake::new(vec![screen("a", 1440, 900)]);
    ops.main = Some("a".into());
    let route = WindowRoute::FocusWindow { other: true };
    let error = perform_on(&ops, route).unwrap_err();
    assert_eq!(error.kind, FocusViewErrorKind::NoDisplay);
    assert_eq!(ops.count("create"), 0);
}
