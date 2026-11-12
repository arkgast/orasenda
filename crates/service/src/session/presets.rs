//! The preset library in the service: the cache of live presets, the one-time seed and
//! migration, listing and resolving the selected preset.

use orasenda_core::{PresetDef, PresetId, SessionPreset, default_presets};
use orasenda_store::presets::{self, StoredPreset};
use orasenda_store::{Store, StoreError, Txn, meta, settings};
use serde::Deserialize;
use uuid::Uuid;

use super::settings::KEY_PRESET;
use super::*;
use crate::api::{PresetEntry, StoreStatus, entries};

/// The `meta` marker the migration leaves; the seed removes it.
pub(super) const META_PRESET_SEED: &str = "preset_seed";
/// The retired custom lengths, read once by the seed.
pub(super) const KEY_CUSTOM: &str = "timer.custom";

/// The old `timer.custom` value.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OldCustom {
    focus_min: u16,
    break_min: u16,
}

/// What loading the library found.
pub(super) struct Loaded {
    /// The live presets in order; never empty.
    pub(super) live: Vec<PresetDef>,
    /// Whether this load ran the seed.
    pub(super) seeded: bool,
}

/// Loads the live presets, running the seed first while its marker is pending. The seed is
/// one transaction. A library with no live preset is reported as an error: the live table is
/// never empty.
pub(super) fn load(store: &Store, now_ms: u64) -> Result<Loaded, StoreError> {
    let pending = store.read(|txn| Ok(meta::get(txn, META_PRESET_SEED)?.is_some()))?;
    let (live, seeded) = if pending {
        store.write(now_ms, |txn| {
            seed(txn)?;
            Ok((read_live(txn)?, true))
        })?
    } else {
        (store.read(read_live)?, false)
    };
    if live.is_empty() {
        return Err(StoreError::Sqlite(
            "the preset library has no live preset".into(),
        ));
    }
    Ok(Loaded { live, seeded })
}

fn read_live(txn: &Txn) -> Result<Vec<PresetDef>, StoreError> {
    Ok(presets::list(txn)?.into_iter().map(|p| p.def).collect())
}

/// Seeds the three defaults (insert-or-ignore by id, so a tombstoned default stays
/// tombstoned), maps the old `timer.preset` and removes the marker. Does nothing once the
/// marker is gone.
fn seed(txn: &mut Txn) -> Result<(), StoreError> {
    let defaults = default_presets();
    for (position, def) in (0u32..).zip(&defaults) {
        if presets::get(txn, &def.id)?.is_none() {
            let stored = StoredPreset {
                def: def.clone(),
                position,
                deleted_at: None,
            };
            presets::insert(txn, &stored)?;
        }
    }
    let old = lenient::<String>(txn, KEY_PRESET)?;
    let selected = match old.as_deref() {
        Some("deep_block") => defaults[2].id.clone(),
        Some("fifty_ten") => insert_user(txn, "50/10", 50, 10, 20)?,
        Some("custom") => match lenient::<OldCustom>(txn, KEY_CUSTOM)? {
            Some(c) if (5..=180).contains(&c.focus_min) && (1..=60).contains(&c.break_min) => {
                let long = (c.break_min * 3).clamp(5, 90);
                insert_user(txn, "Custom", c.focus_min, c.break_min, long)?
            }
            _ => defaults[1].id.clone(),
        },
        Some(other) if live_id(txn, other)? => PresetId(other.to_string()),
        _ => defaults[1].id.clone(),
    };
    settings::set(txn, KEY_PRESET, &selected)?;
    meta::remove(txn, META_PRESET_SEED)
}

/// A user preset after every row there is, with four rounds before the long break.
fn insert_user(
    txn: &mut Txn,
    name: &str,
    focus_min: u16,
    break_min: u16,
    long_break_min: u16,
) -> Result<PresetId, StoreError> {
    let position = presets::list_with_removed(txn)?
        .iter()
        .map(|p| p.position + 1)
        .max()
        .unwrap_or(0);
    let def = PresetDef {
        id: PresetId(Uuid::now_v7().to_string()),
        name: name.to_string(),
        focus_min,
        break_min,
        long_break_min,
        rounds: 4,
        default_key: None,
    };
    let id = def.id.clone();
    presets::insert(
        txn,
        &StoredPreset {
            def,
            position,
            deleted_at: None,
        },
    )?;
    Ok(id)
}

fn live_id(txn: &Txn, id: &str) -> Result<bool, StoreError> {
    let found = presets::get(txn, &PresetId(id.to_string()))?;
    Ok(found.is_some_and(|p| p.deleted_at.is_none()))
}

/// A stored value, or `None` when it is absent or cannot be decoded (logged).
fn lenient<T: serde::de::DeserializeOwned>(txn: &Txn, key: &str) -> Result<Option<T>, StoreError> {
    match settings::get::<T>(txn, key) {
        Err(StoreError::Json(error)) => {
            eprintln!("presets: {key} could not be decoded ({error}); ignoring it");
            Ok(None)
        }
        other => other,
    }
}

/// The snapshot a session keeps of `def`.
pub(super) fn snapshot_of(def: &PresetDef) -> SessionPreset {
    SessionPreset::Library {
        id: def.id.clone(),
        name: def.name.clone(),
        focus_min: def.focus_min,
        break_min: def.break_min,
        long_break_min: def.long_break_min,
        rounds: def.rounds,
    }
}

/// The preset `id` names among `live` (non-empty); the old names resolve to their defaults,
/// and anything unknown to the first live preset.
pub(super) fn resolve<'a>(live: &'a [PresetDef], id: &PresetId) -> &'a PresetDef {
    let defaults = default_presets();
    let legacy = match id.0.as_str() {
        "classic" => Some(&defaults[1].id),
        "deep_block" => Some(&defaults[2].id),
        _ => None,
    };
    live.iter()
        .find(|p| &p.id == id || legacy == Some(&p.id))
        .unwrap_or(&live[0])
}

impl SessionService {
    /// The launch load of the library (the seed included), after the store opens and before
    /// the first view. A failure keeps core's defaults in memory, read-only, and owes the
    /// load to `tick`.
    pub(super) fn load_presets(&mut self, now_ms: u64) {
        let Some(store) = &self.store else {
            return;
        };
        match load(store, now_ms) {
            Ok(loaded) => self.presets = loaded.live,
            Err(error) => {
                eprintln!("presets: could not be loaded ({error}); showing the defaults for now");
                self.recover_owed.presets = true;
                self.store_status = StoreStatus::Unavailable;
            }
        }
    }

    /// Retries the owed load. True when it wrote (the seed ran). The cache is adopted with
    /// the normal path's effects: `presets-changed` and `settings-changed` go out with the
    /// next [`Effects`], and a seed re-reads the settings, which it rewrote.
    pub(super) fn retry_presets(&mut self, now_ms: u64) -> bool {
        let Some(store) = &self.store else {
            return false;
        };
        let Ok(loaded) = load(store, now_ms) else {
            return false;
        };
        self.presets = loaded.live;
        self.recover_owed.presets = false;
        self.presets_event_owed = true;
        self.settings_event_owed = true;
        if loaded.seeded {
            self.recover_owed.settings = true;
        }
        self.log_unknown_selection();
        self.refresh_status();
        loaded.seeded
    }

    /// Logs once when the stored selection names no live preset and is presented as the first.
    pub(super) fn log_unknown_selection(&self) {
        let id = &self.settings.preset_id;
        if !self.presets.iter().any(|p| &p.id == id) && resolve(&self.presets, id).id != *id {
            eprintln!(
                "presets: the selected preset {:?} is not in the library; using the first",
                id.0
            );
        }
    }

    /// The selected preset: the stored id, or the first live preset when it is unknown.
    pub(super) fn selected(&self) -> &PresetDef {
        resolve(&self.presets, &self.settings.preset_id)
    }

    /// The live presets as entries, for `presets_list` and `presets-changed`.
    pub fn presets(&self) -> Vec<PresetEntry> {
        entries(&self.presets)
    }
}
