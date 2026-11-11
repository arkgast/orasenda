//! The planned length in the view, and the fixed preset table.

use orasenda_core::{CustomSpec, Preset};

use super::super::test_support::*;
use super::super::*;
use crate::api::{PresetLength, Settings, Theme, preset_lengths};

#[test]
fn view_planned_min_idle_none() {
    let s = service();
    assert_eq!(s.view(T0).planned_min, None);
}

#[test]
fn view_planned_min_running_classic() {
    let mut s = service();
    let started = s.apply(start(Preset::Classic), T0, id("a"));
    assert_eq!(started.view.planned_min, Some(25));
    assert_eq!(s.view(T0 + MINUTE).planned_min, Some(25));
}

#[test]
fn view_planned_min_paused_kept() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    let paused = s.apply(Action::Pause, T0 + MINUTE, id("x"));
    assert_eq!(paused.view.planned_min, Some(25));
}

#[test]
fn view_planned_min_quick() {
    let mut s = service();
    let started = s.apply(start(Preset::Quick), T0, id("q"));
    assert_eq!(started.view.planned_min, Some(2));
}

#[test]
fn view_planned_min_custom_ignores_later_settings() {
    let mut s = service();
    let saved = |focus_min| Settings {
        theme: Theme::System,
        preset: Preset::Custom,
        custom: CustomSpec {
            focus_min,
            break_min: 5,
        },
        notify_session_end: false,
    };
    s.set_settings(saved(30), T0).expect("settings save");
    let started = s.apply(start(Preset::Custom), T0, id("c"));
    assert_eq!(started.view.planned_min, Some(30));
    s.set_settings(saved(45), T0 + 1).expect("settings save");
    assert_eq!(s.view(T0 + 2).planned_min, Some(30));
}

#[test]
fn presets_get_lists_three_fixed_presets() {
    let lengths = preset_lengths();
    let want = [
        (Preset::Classic, 25, 5),
        (Preset::FiftyTen, 50, 10),
        (Preset::DeepBlock, 90, 15),
    ];
    assert_eq!(lengths.len(), want.len());
    for (got, (preset, focus_min, break_min)) in lengths.iter().zip(want) {
        assert_eq!(
            got,
            &PresetLength {
                preset,
                focus_min,
                break_min
            }
        );
    }
}
