//! Clashes between bindings, and the repair pass (ADR-020).
//!
//! Import and sync write settings directly, so two bindings can meet that no single save would
//! allow. [`repair`] walks the registry in order and gives every device the same answer: a fixed
//! key always wins; between slots an explicit user-set row beats a default-valued slot; ties go
//! by registry order, *In Orasenda* before *Everywhere*. The loser is written `"off"` and marked
//! repaired in a device-only `meta` row, which a later change to that row clears.

use std::collections::HashSet;

use orasenda_store::{StoreError, Txn, meta, settings};

use super::registry::{ACTIONS, FIXED, FixedKey, settings_key};
use super::{Accelerator, ActionId, Slot};

/// The saved text of a binding that is off.
pub const OFF: &str = "off";

/// What holds a chord.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Holder {
    Action(ActionId, Slot),
    Fixed(&'static FixedKey),
}

/// The `meta` key of the repaired mark: `keys.repaired.app.floater`.
fn repaired_key(id: ActionId, slot: Slot) -> String {
    settings_key(id, slot).replacen("keys.", "keys.repaired.", 1)
}

/// Whether the repair pass turned this binding off and the row has not changed since.
pub fn is_repaired(txn: &Txn, id: ActionId, slot: Slot) -> Result<bool, StoreError> {
    Ok(meta::get(txn, &repaired_key(id, slot))?.is_some())
}

/// Saves the row of a binding (a canonical accelerator or `"off"`) and clears its repaired mark.
pub fn write_row(txn: &mut Txn, id: ActionId, slot: Slot, value: &str) -> Result<(), StoreError> {
    settings::set(txn, &settings_key(id, slot), &value.to_string())?;
    meta::remove(txn, &repaired_key(id, slot))
}

/// One binding as saved: its row (if the user or an import set one) and the chord it holds.
struct Entry {
    id: ActionId,
    slot: Slot,
    row: Option<String>,
    chord: Option<String>,
}

/// Every binding, in registry order (*In Orasenda* before *Everywhere*). A value that is not an
/// accelerator holds no chord.
fn load(txn: &Txn) -> Result<Vec<Entry>, StoreError> {
    let mut entries = Vec::new();
    for action in ACTIONS {
        for slot in Slot::ALL {
            let row: Option<String> = settings::get(txn, &settings_key(action.id, slot))?;
            let text = row.as_deref().or(action.default_for(slot));
            let chord = text
                .filter(|text| *text != OFF)
                .and_then(|text| Accelerator::parse(text).ok())
                .map(|acc| acc.canonical());
            entries.push(Entry {
                id: action.id,
                slot,
                row,
                chord,
            });
        }
    }
    Ok(entries)
}

/// What already holds `acc`, other than the binding `except`: a fixed key first, then the
/// bindings in registry order.
pub fn clash(
    txn: &Txn,
    acc: &Accelerator,
    except: (ActionId, Slot),
) -> Result<Option<Holder>, StoreError> {
    let chord = acc.canonical();
    if let Some(fixed) = FIXED.iter().find(|fixed| fixed.keys == chord) {
        return Ok(Some(Holder::Fixed(fixed)));
    }
    Ok(load(txn)?
        .into_iter()
        .find(|e| (e.id, e.slot) != except && e.chord.as_deref() == Some(chord.as_str()))
        .map(|e| Holder::Action(e.id, e.slot)))
}

/// Turns off every binding that loses a clash, in one pass. Returns the bindings it turned off.
/// Running it again changes nothing. A repaired mark whose row has since changed is cleared.
pub fn repair(txn: &mut Txn) -> Result<Vec<(ActionId, Slot)>, StoreError> {
    let entries = load(txn)?;
    let mut losers: HashSet<(ActionId, Slot)> = HashSet::new();
    for e in &entries {
        let held = e.chord.as_deref();
        if FIXED.iter().any(|fixed| Some(fixed.keys) == held) {
            losers.insert((e.id, e.slot));
        }
    }
    let mut seen: HashSet<&str> = HashSet::new();
    for e in &entries {
        let Some(chord) = e.chord.as_deref() else {
            continue;
        };
        if losers.contains(&(e.id, e.slot)) || !seen.insert(chord) {
            continue;
        }
        let group: Vec<&Entry> = entries
            .iter()
            .filter(|o| o.chord.as_deref() == Some(chord) && !losers.contains(&(o.id, o.slot)))
            .collect();
        let winner = group.iter().find(|o| o.row.is_some()).unwrap_or(&group[0]);
        for o in &group {
            if (o.id, o.slot) != (winner.id, winner.slot) {
                losers.insert((o.id, o.slot));
            }
        }
    }
    let mut turned_off = Vec::new();
    for e in &entries {
        let key = (e.id, e.slot);
        if losers.contains(&key) {
            settings::set(txn, &settings_key(e.id, e.slot), &OFF.to_string())?;
            meta::set(txn, &repaired_key(e.id, e.slot), "1")?;
            turned_off.push(key);
        } else if e.row.as_deref() != Some(OFF) {
            meta::remove(txn, &repaired_key(e.id, e.slot))?;
        }
    }
    Ok(turned_off)
}
