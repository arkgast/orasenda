//! The planned length in the view.

use super::super::test_support::*;
use super::super::*;
use crate::api::Settings;

#[test]
fn view_planned_min_idle_none() {
    let s = service();
    assert_eq!(s.view(T0).planned_min, None);
}

#[test]
fn view_planned_min_running_classic() {
    let mut s = service();
    let started = s.apply(start(), T0, id("a"));
    assert_eq!(started.view.planned_min, Some(25));
    assert_eq!(s.view(T0 + MINUTE).planned_min, Some(25));
}

#[test]
fn view_planned_min_paused_kept() {
    let mut s = service();
    s.apply(start(), T0, id("a"));
    let paused = s.apply(Action::Pause, T0 + MINUTE, id("x"));
    assert_eq!(paused.view.planned_min, Some(25));
}

#[test]
fn view_planned_min_quick() {
    let mut s = service();
    let started = s.apply(start_quick(), T0, id("q"));
    assert_eq!(started.view.planned_min, Some(2));
}

#[test]
fn view_planned_min_ignores_a_later_selection() {
    let mut s = service();
    s.set_settings(
        Settings {
            preset_id: default_id(0),
            ..Settings::default()
        },
        T0,
    )
    .expect("settings save");
    let started = s.apply(start(), T0, id("c"));
    assert_eq!(started.view.planned_min, Some(15));
    s.set_settings(deep_work(), T0 + 1).expect("settings save");
    assert_eq!(s.view(T0 + 2).planned_min, Some(15));
}

#[test]
fn view_planned_min_restored() {
    let mut s = service();
    s.apply(start(), T0, id("c"));
    s.set_settings(deep_work(), T0 + 1).expect("settings save");
    let back = relaunch(&mut s, T0 + MINUTE);
    assert_eq!(back.view(T0 + MINUTE).planned_min, Some(25));
    assert_eq!(back.view(T0 + MINUTE).break_min, Some(5));
}
