use orasenda_service::api::KeyboardView;
use orasenda_service::keyboard::test_support::keyboard_view;
use orasenda_service::keyboard::{ActionId, Slot};

use super::app_menu::{SETTINGS_ID, app_menu_ids, is_app_menu_command};
use super::*;
use crate::tray::{END_SESSION, PAUSE, QUIT, RESUME, SETTINGS, SHOW, menu_command};

fn defaults() -> KeyboardView {
    keyboard_view(&[])
}

fn ids(entries: &[Entry]) -> Vec<&'static str> {
    items(entries).map(|i| i.id).collect()
}

#[test]
fn menu_ids_route_to_exactly_one_handler() {
    assert_eq!(route("focus:commands"), Route::Focus);
    assert_eq!(route("view:full-screen"), Route::View);
    assert_eq!(route("window:floater"), Route::Window);
    assert_eq!(route("settings"), Route::App);
    assert_eq!(route("about"), Route::App);
}

#[test]
fn view_and_window_are_built_from_the_registry() {
    let view = defaults();
    let shown = view_menu::entries(&view, 1);
    let item = items(&shown).next().expect("Full Screen");
    assert_eq!(item.accelerator.as_deref(), Some("Super+KeyF"));
    assert_eq!(item.action, Some(ActionId::FullScreen));
    let window = window_menu::entries(&view);
    let floater = items(&window).next().expect("Floating Timer");
    assert_eq!(floater.accelerator.as_deref(), Some("Shift+Super+KeyT"));
    // The Focus menu's timer items carry no In Orasenda key by default; Commands… is fixed.
    let focus = focus_menu::entries(&view);
    let accelerators: Vec<_> = items(&focus).map(|i| i.accelerator.clone()).collect();
    assert_eq!(accelerators, [None, None, Some("Super+KeyK".to_string())]);
}

#[test]
fn view_menu_other_display_only_with_two() {
    let view = defaults();
    for (displays, other) in [(0, false), (1, false), (2, true), (3, true)] {
        let has =
            ids(&view_menu::entries(&view, displays)).contains(&view_menu::FULL_SCREEN_OTHER_ID);
        assert_eq!(has, other, "{displays} displays");
    }
    let two = view_menu::entries(&view, 2);
    let other = items(&two).nth(1).expect("the second item");
    let leave = items(&two).nth(2).expect("the third item");
    assert_eq!(leave.id, view_menu::LEAVE_FULL_SCREEN_ID);
    assert_eq!(leave.action, Some(ActionId::LeaveFullScreen));
    assert_eq!(
        view_menu::action_of(leave.id),
        Some(ActionId::LeaveFullScreen)
    );
    assert_eq!(other.label, "Full Screen on Another Display…");
    assert_eq!(other.accelerator.as_deref(), Some("Shift+Super+KeyF"));
}

#[test]
fn menu_from_registry_rebuilds_accelerator() {
    let before = accelerators(&defaults(), 2);
    let after_view = keyboard_view(&[(ActionId::Floater, Slot::App, Some("Control+Super+KeyJ"))]);
    let after = accelerators(&after_view, 2);
    let of = |list: &[(&str, Option<String>)], id: &str| {
        list.iter()
            .find(|(i, _)| *i == id)
            .and_then(|(_, a)| a.clone())
    };
    assert_eq!(
        of(&before, "window:floater").as_deref(),
        Some("Shift+Super+KeyT")
    );
    assert_eq!(
        of(&after, "window:floater").as_deref(),
        Some("Control+Super+KeyJ")
    );
    assert_eq!(
        of(&before, "view:full-screen"),
        of(&after, "view:full-screen")
    );
    // A cleared slot removes the accelerator.
    let cleared = keyboard_view(&[(ActionId::FullScreen, Slot::App, None)]);
    assert_eq!(of(&accelerators(&cleared, 2), "view:full-screen"), None);
}

#[test]
fn menu_ignored_while_capture_key() {
    for id in [
        "view:full-screen",
        "window:floater",
        "focus:start-pause",
        "focus:capture",
    ] {
        assert!(action_for(id, false).is_some(), "{id}");
        assert_eq!(
            action_for(id, true),
            None,
            "{id} while the capture panel is key"
        );
    }
    assert_eq!(action_for("window:floater", false), Some(ActionId::Floater));
    assert_eq!(action_for("focus:commands", false), None);
}

#[test]
fn registry_menu_ids_are_disjoint_from_the_other_menus() {
    let view = defaults();
    let mut own = Vec::new();
    for entries in [
        view_menu::entries(&view, 2),
        window_menu::entries(&view),
        focus_menu::entries(&view),
    ] {
        own.extend(ids(&entries));
    }
    for id in &own {
        assert!(!is_app_menu_command(id), "{id}");
        assert!(menu_command(id).is_none(), "{id}");
        assert!(!id.starts_with("popup:"), "{id}");
        assert!(![view_menu::VIEW_MENU_ID, focus_menu::FOCUS_MENU_ID].contains(id));
    }
    for foreign in [
        PAUSE,
        RESUME,
        END_SESSION,
        SHOW,
        SETTINGS,
        QUIT,
        SETTINGS_ID,
    ] {
        assert_eq!(route(foreign), Route::App, "{foreign}");
    }
    assert!(
        !app_menu_ids(&["about".to_string()], "sep")
            .iter()
            .any(|i| own.contains(&i.as_str()))
    );
}

/// One ⌘K in `main` reaches the menu once: exactly one item registers the chord, and its handler
/// is the one that emits `palette-open` (`windows::open_palette`). The webview binds no ⌘K.
#[test]
fn cmd_k_emits_palette_open_once() {
    let view = defaults();
    let mut all = Vec::new();
    for entries in [
        view_menu::entries(&view, 2),
        window_menu::entries(&view),
        focus_menu::entries(&view),
    ] {
        all.extend(items(&entries).cloned());
    }
    let k: Vec<_> = all
        .iter()
        .filter(|i| i.accelerator.as_deref() == Some("Super+KeyK"))
        .collect();
    assert_eq!(k.len(), 1);
    assert_eq!(k[0].id, focus_menu::COMMANDS_ID);
    assert_eq!(route(focus_menu::COMMANDS_ID), Route::Focus);
    assert!(!is_app_menu_command(focus_menu::COMMANDS_ID));
}
