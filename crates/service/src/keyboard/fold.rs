//! The fold rule (ADR-020): the two legacy keys of spec F, `keys.start_pause` and `keys.capture`,
//! become *Everywhere* bindings of the new model. Legacy rows are never written again.
//!
//! At launch the fold runs while the device-only `meta` flag `keys.legacy_folded` is absent.
//! After an import it runs again only when the imported file carried legacy keys and no
//! `keys.app.*` or `keys.global.*` rows.

use orasenda_store::portability::SyncRows;
use orasenda_store::{StoreError, Txn, meta, settings};

use super::conflicts::OFF;
use super::registry::{action, settings_key};
use super::{Accelerator, ActionId, Slot};

/// The device-only flag: this device has folded its legacy keys.
pub const LEGACY_FOLDED: &str = "keys.legacy_folded";

/// The legacy keys: setting key, the action it becomes, and its old default.
const LEGACY: [(&str, ActionId, &str); 2] = [
    ("keys.start_pause", ActionId::StartPause, "Control+Alt+KeyF"),
    ("keys.capture", ActionId::Capture, "Control+Alt+KeyN"),
];

/// Folds the saved legacy keys unless this device already did. Returns whether it ran.
pub fn run_at_launch(txn: &mut Txn) -> Result<bool, StoreError> {
    if meta::get(txn, LEGACY_FOLDED)?.is_some() {
        return Ok(false);
    }
    for (key, id, old_default) in LEGACY {
        // A non-string value (an import can bring one) is unparseable: no row.
        if let Some(Legacy::Text(value)) = settings::get::<Legacy>(txn, key)? {
            fold_one(txn, id, old_default, &value)?;
        }
    }
    meta::set(txn, LEGACY_FOLDED, "1")?;
    Ok(true)
}

/// Folds the legacy values of an imported file when it carried no new-model rows, over the
/// current *Everywhere* bindings of those two actions. Returns whether it ran.
pub fn run_after_import(txn: &mut Txn, imported: &SyncRows) -> Result<bool, StoreError> {
    let has_new = imported
        .settings
        .iter()
        .any(|row| row.key.starts_with("keys.app.") || row.key.starts_with("keys.global."));
    let legacy: Vec<_> = LEGACY
        .iter()
        .filter_map(|(key, id, old_default)| {
            let row = imported.settings.iter().find(|row| row.key == *key)?;
            let value = json_string(&row.value)?;
            Some((*id, *old_default, value))
        })
        .collect();
    if has_new || legacy.is_empty() {
        return Ok(false);
    }
    for (id, old_default, value) in legacy {
        fold_one(txn, id, old_default, &value)?;
    }
    meta::set(txn, LEGACY_FOLDED, "1")?;
    Ok(true)
}

/// A stored legacy value: text, or anything else (which is not a binding).
#[derive(serde::Deserialize)]
#[serde(untagged)]
enum Legacy {
    Text(String),
    Other(serde::de::IgnoredAny),
}

/// The text of a stored JSON string (`\"off\"`), or `None` for any other value. Accelerators
/// hold no quote or backslash, so a value with one is not a binding.
fn json_string(json: &str) -> Option<String> {
    let inner = json.strip_prefix('"')?.strip_suffix('"')?;
    (!inner.contains(['"', '\\'])).then(|| inner.to_string())
}

/// Writes the *Everywhere* row for one legacy value. The old default and a value that is not an
/// accelerator leave no row, so the new default applies; a row already there is reset to that
/// default (settings are never deleted).
fn fold_one(txn: &mut Txn, id: ActionId, old_default: &str, value: &str) -> Result<(), StoreError> {
    let key = settings_key(id, Slot::Global);
    let kept = if value == OFF {
        Some(OFF.to_string())
    } else {
        Accelerator::parse(value)
            .ok()
            .map(|acc| acc.canonical())
            .filter(|canonical| canonical != old_default)
    };
    match kept {
        Some(text) => settings::set(txn, &key, &text),
        None => {
            if settings::get::<String>(txn, &key)?.is_some() {
                let default = action(id).global_default.unwrap_or(OFF);
                settings::set(txn, &key, &default.to_string())?;
            }
            Ok(())
        }
    }
}
