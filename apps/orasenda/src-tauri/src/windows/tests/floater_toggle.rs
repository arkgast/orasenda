//! The floater's toggle and the window half of `actions::run`, against the recording fake.

use super::*;
use crate::actions::{
    DisplayChoice, FullScreenRoute, Outcome, Route, WindowRoute, display_choice, perform_on, route,
};
use crate::windows::floater::{Toggled, open_floater_on, toggle_floater_on};
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
fn full_screen_ids_route_to_main_full_screen() {
    assert_eq!(
        route(ActionId::FullScreen),
        Route::FullScreen(FullScreenRoute::Enter)
    );
    assert_eq!(
        route(ActionId::FullScreenOther),
        Route::FullScreen(FullScreenRoute::ChooseDisplay)
    );
    assert_eq!(
        route(ActionId::LeaveFullScreen),
        Route::FullScreen(FullScreenRoute::Leave)
    );
}

#[test]
fn another_display_opens_the_palette_only_with_two_or_more() {
    assert_eq!(display_choice(0), DisplayChoice::ThisDisplay);
    assert_eq!(display_choice(1), DisplayChoice::ThisDisplay);
    assert_eq!(display_choice(2), DisplayChoice::Palette);
    assert_eq!(display_choice(3), DisplayChoice::Palette);
}

#[test]
fn floater_toggle_keeps_main_in_full_screen() {
    let ops = fake();
    ops.full.set(true);
    toggle_floater_on(&ops).unwrap();
    assert!(ops.exists("floater"));
    assert_eq!(ops.count("hide_main"), 0, "{:?}", ops.calls());
    // A second open only refocuses, and still leaves main alone.
    open_floater_on(&ops).unwrap();
    assert_eq!(ops.count("hide_main"), 0);
    assert!(ops.calls().iter().all(|c| !c.contains("full")));
}

#[test]
fn floater_toggle_hides_main_when_windowed() {
    let ops = fake();
    toggle_floater_on(&ops).unwrap();
    assert_eq!(ops.count("hide_main"), 1);
}
