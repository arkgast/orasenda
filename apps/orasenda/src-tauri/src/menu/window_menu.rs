//! The Window menu's own item, built from the registry: Floating Timer, after the standard
//! Minimize and Zoom items.

use orasenda_service::api::KeyboardView;
use orasenda_service::keyboard::ActionId;

use super::{Entry, Item, app_keys};

pub(crate) const FLOATER_ID: &str = "window:floater";

pub(crate) fn is_window_id(id: &str) -> bool {
    id.starts_with("window:")
}

pub(crate) fn action_of(id: &str) -> Option<ActionId> {
    (id == FLOATER_ID).then_some(ActionId::Floater)
}

/// A separator, then Floating Timer. It reads the same whether the floater is shown or not: it
/// toggles it (`actions::run`).
pub(crate) fn entries(view: &KeyboardView) -> Vec<Entry> {
    vec![
        Entry::Separator,
        Entry::Item(Item {
            id: FLOATER_ID,
            label: "Floating Timer",
            action: Some(ActionId::Floater),
            accelerator: app_keys(view, ActionId::Floater),
        }),
    ]
}
