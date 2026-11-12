//! Tests for the Focus views' items in the menu-bar menu: Full screen and the floating timer.

use super::*;
use crate::ipc::DisplayInfo;
use crate::tray::menu::{HIDE_FLOATER, SHOW_FLOATER};

fn display(id: &str, name: &str, main: bool) -> DisplayInfo {
    DisplayInfo {
        id: id.into(),
        name: name.into(),
        has_main_window: main,
    }
}

fn focus(displays: Vec<DisplayInfo>, floater_shown: bool) -> FocusItems {
    FocusItems {
        displays,
        floater_shown,
    }
}

fn labels(entries: &[MenuEntry]) -> Vec<String> {
    entries
        .iter()
        .map(|entry| match entry {
            MenuEntry::Item { label, .. } => label.clone(),
            MenuEntry::Header => "<header>".to_string(),
            MenuEntry::Separator => "—".to_string(),
            MenuEntry::Submenu { label, .. } => format!("{label} ▸"),
        })
        .collect()
}

fn one() -> FocusItems {
    focus(vec![display("A", "Built-in Retina Display", true)], false)
}

fn two(floater_shown: bool) -> FocusItems {
    focus(
        vec![
            display("A", "Built-in Retina Display", true),
            display("B", "DELL U2720Q", false),
        ],
        floater_shown,
    )
}

#[test]
fn tray_focus_items_idle() {
    let entries = menu_items(&idle(), &NextSession::default(), &one(), false);
    assert_eq!(
        labels(&entries),
        [
            "Start focus · 25 min",
            "Just 2 minutes",
            "Preset ▸",
            "—",
            "Full screen",
            "Show floating timer",
            "—",
            "Show Orasenda",
            "Settings…",
            "—",
            "Quit Orasenda"
        ]
    );
    let entries = menu_items(&idle(), &NextSession::default(), &two(false), false);
    let MenuEntry::Submenu { entries: shown, .. } = &entries[4] else {
        panic!("several displays make a Full screen submenu");
    };
    assert_eq!(
        labels(shown),
        [
            "Full screen on Built-in Retina Display",
            "Full screen on DELL U2720Q"
        ]
    );
    // The Focus menu owns the accelerators; these items show none.
    for entry in entries.iter().chain(shown.iter()) {
        if let MenuEntry::Item {
            id,
            accelerator: Some(accelerator),
            ..
        } = entry
        {
            assert!(
                [SETTINGS, QUIT].contains(&id.as_str()),
                "{id} shows {accelerator}"
            );
        }
    }
}

#[test]
fn tray_focus_items_running() {
    for view in [running(S59), paused(S59)] {
        let got = labels(&menu_items(&view, &NextSession::default(), &one(), false));
        assert_eq!(
            got[1..],
            [
                "—",
                got[2].as_str(),
                "End session",
                "—",
                "Full screen",
                "Show floating timer",
                "—",
                "Show Orasenda",
                "Settings…",
                "—",
                "Quit Orasenda"
            ]
        );
    }
}

#[test]
fn tray_focus_items_absent_without_displays() {
    let with_none = menu_items(
        &idle(),
        &NextSession::default(),
        &FocusItems::default(),
        false,
    );
    let labels = labels(&with_none);
    assert!(
        !labels
            .iter()
            .any(|l| l.contains("floating") || l.starts_with("Full"))
    );
}

#[test]
fn tray_floater_label_toggles() {
    let find = |shown: bool| {
        let entries = menu_items(&idle(), &NextSession::default(), &two(shown), false);
        entries
            .into_iter()
            .find_map(|entry| match entry {
                MenuEntry::Item { id, label, .. } if label.ends_with("floating timer") => {
                    Some((id, label))
                }
                _ => None,
            })
            .expect("the floating timer item")
    };
    assert_eq!(
        find(false),
        (SHOW_FLOATER.to_string(), "Show floating timer".to_string())
    );
    assert_eq!(
        find(true),
        (HIDE_FLOATER.to_string(), "Hide floating timer".to_string())
    );
    assert_eq!(menu_command(SHOW_FLOATER), Some(MenuCommand::ShowFloater));
    assert_eq!(menu_command(HIDE_FLOATER), Some(MenuCommand::HideFloater));
    assert_eq!(
        menu_command("full-screen:B"),
        Some(MenuCommand::FullScreen("B".to_string()))
    );
}

#[test]
fn tray_focus_changed_redraws_the_menu_once() {
    let (tray, calls) = tray_with(Recorder::default());
    tray.focus_changed(two(false));
    let first = calls.take();
    assert_eq!(first.len(), 1, "{first:?}");
    assert!(matches!(first[0], Call::Menu(..)));
    tray.focus_changed(two(false));
    assert_eq!(calls.take(), [], "the same items draw nothing again");
    tray.focus_changed(two(true));
    assert_eq!(calls.take().len(), 1);
}
