//! The preset cap after an import: the newest `MAX_PRESETS` live presets stay.

use orasenda_core::PresetId;
use orasenda_store::portability::rows;
use orasenda_store::presets;
use orasenda_store::{StoreError, Txn, settings};

use crate::session::{KEY_PRESET, MAX_PRESETS, resolve};

/// Tombstones the oldest live presets (by `updated_at`) beyond `MAX_PRESETS`. The selected
/// preset, or the first live one when the stored id is unknown, always stays. Returns how
/// many were tombstoned; each is logged like any removal.
pub(super) fn enforce_preset_cap(txn: &mut Txn) -> Result<usize, StoreError> {
    let all = rows(txn)?.presets;
    let mut live: Vec<_> = all.iter().filter(|row| row.deleted_at.is_none()).collect();
    if live.len() <= MAX_PRESETS {
        return Ok(0);
    }
    let stored = match settings::get::<PresetId>(txn, KEY_PRESET) {
        Ok(found) => found,
        // A value that can't be decoded reads as unknown, as the launch read does.
        Err(StoreError::Json(_)) => None,
        Err(error) => return Err(error),
    };
    let defs: Vec<_> = presets::list(txn)?.into_iter().map(|p| p.def).collect();
    let selected = match defs.is_empty() {
        true => None,
        false => {
            let stored = stored.unwrap_or_else(|| defs[0].id.clone());
            Some(resolve(&defs, &stored).id.0.clone())
        }
    };
    live.sort_by(|a, b| (b.updated_at, a.position, &a.id).cmp(&(a.updated_at, b.position, &b.id)));
    let mut keep: Vec<&str> = live
        .iter()
        .take(MAX_PRESETS)
        .map(|r| r.id.as_str())
        .collect();
    if let Some(selected) = selected.as_deref()
        && !keep.contains(&selected)
    {
        keep.pop();
        keep.push(selected);
    }
    let mut removed = 0;
    for row in live.iter().filter(|row| !keep.contains(&row.id.as_str())) {
        eprintln!("import: preset {:?} is over the cap; removed", row.name);
        presets::remove(txn, &PresetId(row.id.clone()))?;
        removed += 1;
    }
    Ok(removed)
}
