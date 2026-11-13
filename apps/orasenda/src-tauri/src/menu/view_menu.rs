//! The View menu, built from the registry: Full Screen, and with two or more displays Full Screen
//! on Another Display…. Rust owns the accelerators, so they work from every Orasenda window.
//! Leave Full Screen joins in H4. Tauri's own Enter Full Screen gives way to these items.

use orasenda_service::api::KeyboardView;
use orasenda_service::keyboard::ActionId;

use super::{Entry, Item, app_keys};

/// The submenu's id, to find it again when the displays change.
pub(crate) const VIEW_MENU_ID: &str = "view:menu";
pub(crate) const FULL_SCREEN_ID: &str = "view:full-screen";
pub(crate) const FULL_SCREEN_OTHER_ID: &str = "view:full-screen-other";

pub(crate) fn is_view_id(id: &str) -> bool {
    id.starts_with("view:")
}

pub(crate) fn action_of(id: &str) -> Option<ActionId> {
    match id {
        FULL_SCREEN_ID => Some(ActionId::FullScreen),
        FULL_SCREEN_OTHER_ID => Some(ActionId::FullScreenOther),
        _ => None,
    }
}

/// The items for `displays` connected displays.
pub(crate) fn entries(view: &KeyboardView, displays: usize) -> Vec<Entry> {
    let item = |id, label, action| {
        Entry::Item(Item {
            id,
            label,
            action: Some(action),
            accelerator: app_keys(view, action),
        })
    };
    let mut out = vec![item(FULL_SCREEN_ID, "Full Screen", ActionId::FullScreen)];
    if displays >= 2 {
        out.push(item(
            FULL_SCREEN_OTHER_ID,
            "Full Screen on Another Display…",
            ActionId::FullScreenOther,
        ));
    }
    out
}
