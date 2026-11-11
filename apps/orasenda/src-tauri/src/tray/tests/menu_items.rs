//! Tests for the menu's entries per state, its commands and the settings follow-up.

use orasenda_core::CustomSpec;
use orasenda_service::api::Settings;

use super::*;
use crate::runtime::session::Action;
use orasenda_core::Preset;

fn next() -> NextSession {
    NextSession::default()
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

fn preset_submenu(entries: &[MenuEntry]) -> &[MenuEntry] {
    entries
        .iter()
        .find_map(|entry| match entry {
            MenuEntry::Submenu { entries, .. } => Some(entries.as_slice()),
            _ => None,
        })
        .expect("the idle menu has a Preset submenu")
}

#[test]
fn menu_items_idle() {
    let entries = menu_items(&idle(), &next(), false);
    assert_eq!(
        labels(&entries),
        [
            "Start focus · 25 min",
            "Just 2 minutes",
            "Preset ▸",
            "—",
            "Show Orasenda",
            "Settings…",
            "—",
            "Quit Orasenda"
        ]
    );
    assert_eq!(
        labels(preset_submenu(&entries)),
        [
            "Classic 25 / 5",
            "50/10 50 / 10",
            "Deep Block 90 / 15",
            "Custom 45 / 10",
            "—",
            "Edit times in Settings…"
        ]
    );
    let accelerators: Vec<_> = entries
        .iter()
        .filter_map(|entry| match entry {
            MenuEntry::Item {
                label,
                accelerator: Some(accelerator),
                ..
            } => Some((label.as_str(), *accelerator)),
            _ => None,
        })
        .collect();
    assert_eq!(
        accelerators,
        [
            ("Settings…", "CmdOrCtrl+,"),
            ("Quit Orasenda", "CmdOrCtrl+Q")
        ]
    );
}

#[test]
fn menu_items_running() {
    assert_eq!(
        labels(&menu_items(&running(S59), &next(), false)),
        [
            "<header>",
            "—",
            "Pause session",
            "End session",
            "—",
            "Show Orasenda",
            "Settings…",
            "—",
            "Quit Orasenda"
        ]
    );
}

#[test]
fn menu_items_paused() {
    assert_eq!(
        labels(&menu_items(&paused(S59), &next(), false)),
        [
            "<header>",
            "—",
            "Resume session",
            "End session",
            "—",
            "Show Orasenda",
            "Settings…",
            "—",
            "Quit Orasenda"
        ]
    );
}

#[test]
fn preset_submenu_checks_saved() {
    for saved in [
        Preset::Classic,
        Preset::FiftyTen,
        Preset::DeepBlock,
        Preset::Custom,
    ] {
        let next = NextSession::from_settings(&Settings {
            preset: saved,
            ..Settings::default()
        });
        let entries = menu_items(&idle(), &next, false);
        let checked: Vec<_> = preset_submenu(&entries)
            .iter()
            .filter_map(|entry| match entry {
                MenuEntry::Item {
                    id,
                    checked: Some(true),
                    ..
                } => Some(*id),
                _ => None,
            })
            .collect();
        assert_eq!(checked.len(), 1, "one item is checked for {saved:?}");
        assert!(matches!(
            menu_command(checked[0]),
            Some(MenuCommand::SetPreset(chosen)) if chosen == saved
        ));
    }
}

#[test]
fn start_item_uses_saved_preset_and_no_custom() {
    assert_eq!(menu_command(START), Some(MenuCommand::Start));
    assert_eq!(menu_command(JUST_TWO), Some(MenuCommand::JustTwo));
    for saved in [Preset::Classic, Preset::FiftyTen, Preset::Custom] {
        match start_action(saved, false) {
            Action::Start(request) => {
                assert_eq!(request.preset, saved);
                assert_eq!(request.custom, None);
            }
            _ => panic!("Start is a start"),
        }
    }
    match start_action(Preset::DeepBlock, true) {
        Action::Start(request) => {
            assert_eq!(request.preset, Preset::Quick);
            assert_eq!(request.custom, None);
        }
        _ => panic!("Just 2 minutes is a start"),
    }
}

#[test]
fn next_session_minutes_follow_the_saved_preset() {
    let custom = CustomSpec {
        focus_min: 30,
        break_min: 6,
    };
    let next = NextSession::from_settings(&Settings {
        preset: Preset::Custom,
        custom,
        ..Settings::default()
    });
    assert_eq!(next.focus_min, 30);
    let entries = menu_items(&idle(), &next, false);
    assert_eq!(labels(&entries)[0], "Start focus · 30 min");
    assert_eq!(labels(preset_submenu(&entries))[3], "Custom 30 / 6");
}

#[test]
fn settings_change_rerenders_menu() {
    let (tray, calls) = tray_with(Recorder::default());
    tray.settings_changed(&Settings {
        preset: Preset::FiftyTen,
        ..Settings::default()
    });
    let next = NextSession {
        preset: Preset::FiftyTen,
        focus_min: 50,
        custom: CustomSpec::default(),
    };
    assert_eq!(
        calls.take(),
        [Call::Menu(menu_items(&idle(), &next, false), None)]
    );
    assert_eq!(
        labels(&menu_items(&idle(), &next, false))[0],
        "Start focus · 50 min"
    );

    // The same settings again cost nothing.
    tray.settings_changed(&Settings {
        preset: Preset::FiftyTen,
        ..Settings::default()
    });
    assert_eq!(calls.take(), []);
}

#[test]
fn menu_command_maps_every_tray_item() {
    assert_eq!(
        menu_command(PAUSE),
        Some(MenuCommand::Session(Action::Pause))
    );
    assert_eq!(
        menu_command(RESUME),
        Some(MenuCommand::Session(Action::Resume))
    );
    assert_eq!(
        menu_command(END_SESSION),
        Some(MenuCommand::Session(Action::Stop))
    );
    assert_eq!(menu_command(SHOW), Some(MenuCommand::Show));
    assert_eq!(menu_command(SETTINGS), Some(MenuCommand::Settings));
    assert_eq!(menu_command(EDIT_TIMES), Some(MenuCommand::EditTimes));
    assert_eq!(menu_command(QUIT), Some(MenuCommand::Quit));
    assert_eq!(
        menu_command("preset:fifty_ten"),
        Some(MenuCommand::SetPreset(Preset::FiftyTen))
    );
    assert!(menu_command("preset:quick").is_none());
    assert!(menu_command("about").is_none());
    assert!(menu_command("settings").is_none());
}
