//! Tests for the menu's entries per state, its commands and the settings follow-up.

use super::*;
use crate::runtime::session::Action;

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
            "Gentle Start 15 / 5",
            "Steady Focus 25 / 5",
            "Deep Work 90 / 15",
            "—",
            "Edit presets in Settings…"
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
fn tray_ids_never_collide_with_the_app_menu() {
    let spec_next = NextSession::default();
    for view in [idle(), running(S59), paused(S59)] {
        for entry in menu_items(&view, &spec_next, false) {
            let mut stack = vec![entry];
            while let Some(entry) = stack.pop() {
                match entry {
                    MenuEntry::Item { id, .. } => {
                        assert!(
                            !crate::menu::app_menu::is_app_menu_command(&id),
                            "{id} collides"
                        )
                    }
                    MenuEntry::Submenu { entries, .. } => stack.extend(entries),
                    _ => {}
                }
            }
        }
    }
}

#[test]
fn start_sends_quick_only() {
    assert_eq!(menu_command(START), Some(MenuCommand::Start));
    assert_eq!(menu_command(JUST_TWO), Some(MenuCommand::JustTwo));
    for quick in [false, true] {
        match start_action(quick) {
            Action::Start(request) => assert_eq!(request.quick, quick),
            _ => panic!("Start is a start"),
        }
    }
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
        menu_command("preset:0192f6a0-0000-7000-8000-000000000003"),
        Some(MenuCommand::SetPreset(orasenda_core::PresetId(
            "0192f6a0-0000-7000-8000-000000000003".into()
        )))
    );
    assert!(menu_command("about").is_none());
    assert!(menu_command("settings").is_none());
}

#[test]
fn menu_items_spike() {
    for view in [idle(), running(S59), paused(S59)] {
        let without = labels(&menu_items(&view, &next(), false));
        assert!(!without.contains(&"Developer panel".to_string()));
        let with = labels(&menu_items(&view, &next(), true));
        let mut expected = without.clone();
        expected.splice(
            expected.len() - 1..expected.len() - 1,
            ["Developer panel".to_string(), "—".to_string()],
        );
        assert_eq!(with, expected);
    }
}

#[test]
fn developer_panel_item_has_a_command() {
    assert_eq!(menu_command("developer-panel"), Some(MenuCommand::DevPanel));
}

#[test]
fn edit_presets_item_opens_settings_timer() {
    assert_eq!(
        settings_target(&menu_command(EDIT_TIMES).unwrap()),
        Some(crate::ipc::SettingsTarget::Timer)
    );
    assert_eq!(settings_target(&menu_command(SETTINGS).unwrap()), None);
}
