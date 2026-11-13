//! The view of the registry: each binding resolved from its saved row (or its default) and the
//! status of the *Everywhere* ones.

use std::collections::HashMap;

use orasenda_store::{StoreError, settings};

use super::conflicts::{OFF, is_repaired};
use super::registry::{ACTIONS, FIXED, settings_key};
use super::{Accelerator, ActionId, Slot};
use crate::api::{
    ActionView, BindingView, FixedKeyView, GlobalBindingView, KeyboardView, ShortcutStatus,
};
use crate::scheduler::Host;
use crate::session::{current_settings, lock};

/// The saved rows: the text of a binding (if a row exists) and its repaired mark.
pub(super) type Rows = HashMap<(ActionId, Slot), (Option<String>, bool)>;

/// Reads every row. `Err` when the store is unavailable.
pub(super) fn read_rows<H: Host>(host: &H) -> Result<Rows, StoreError> {
    let service = host.service().ok_or(StoreError::Closed)?;
    let guard = lock(service);
    let store = guard.store().ok_or(StoreError::Closed)?;
    store.read(|txn| {
        let mut rows = Rows::new();
        for action in ACTIONS {
            for slot in Slot::ALL {
                let row = settings::get::<String>(txn, &settings_key(action.id, slot))?;
                rows.insert((action.id, slot), (row, is_repaired(txn, action.id, slot)?));
            }
        }
        Ok(rows)
    })
}

/// The text a binding holds now: its row, else the default. `None` when it is off or empty.
pub(super) fn effective(rows: &Rows, id: ActionId, slot: Slot) -> Option<String> {
    let row = rows.get(&(id, slot)).and_then(|(row, _)| row.clone());
    let text = row.or_else(|| {
        super::registry::action(id)
            .default_for(slot)
            .map(str::to_owned)
    });
    text.filter(|text| text != OFF)
}

fn binding(rows: &Rows, id: ActionId, slot: Slot) -> BindingView {
    let keys = effective(rows, id, slot);
    let parsed = keys.as_deref().and_then(|k| Accelerator::parse(k).ok());
    let default = super::registry::action(id).default_for(slot);
    BindingView {
        is_default: keys.as_deref() == default,
        repaired: rows.get(&(id, slot)).is_some_and(|(_, repaired)| *repaired),
        display: parsed.as_ref().map(Accelerator::describe),
        spoken: parsed.as_ref().map(Accelerator::spoken),
        keys,
    }
}

/// The webview's view. `statuses` is the *Everywhere* status per action, in registry order.
pub(super) fn view_of<H: Host>(
    host: &H,
    rows: &Rows,
    statuses: &[ShortcutStatus],
    voice_over: bool,
) -> KeyboardView {
    view_from(
        rows,
        statuses,
        current_settings(host).single_key,
        voice_over,
    )
}

/// The view over given rows and statuses.
pub(super) fn view_from(
    rows: &Rows,
    statuses: &[ShortcutStatus],
    single_key: bool,
    voice_over: bool,
) -> KeyboardView {
    let actions = ACTIONS
        .iter()
        .map(|a| ActionView {
            id: a.id,
            label: a.label.into(),
            description: a.description.into(),
            group: a.group,
            app: binding(rows, a.id, Slot::App),
            global: GlobalBindingView {
                binding: binding(rows, a.id, Slot::Global),
                status: statuses[a.id.index()],
            },
            single_key: a.single_key.map(str::to_owned),
        })
        .collect();
    let fixed = FIXED
        .iter()
        .map(|f| {
            let parsed = Accelerator::parse(f.keys).ok();
            FixedKeyView {
                label: f.label.into(),
                keys: f.keys.into(),
                display: parsed
                    .as_ref()
                    .map_or_else(|| f.keys.into(), Accelerator::describe),
                spoken: parsed
                    .as_ref()
                    .map_or_else(|| f.keys.into(), Accelerator::spoken),
            }
        })
        .collect();
    KeyboardView {
        actions,
        fixed,
        single_key,
        voice_over,
    }
}
