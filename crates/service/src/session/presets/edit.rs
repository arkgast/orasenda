//! Editing the preset library: add, update, remove with undo, restore the defaults.
//!
//! Every edit is one transaction (with anything owed) that also rewrites `timer.preset` when
//! the selected preset is removed, then reloads the cache from the store, so the cache is
//! what the database holds.

use orasenda_core::{PresetDef, PresetField, PresetId, default_presets, normalize_name};
use orasenda_store::presets::{self, StoredPreset};
use orasenda_store::{StoreError, Txn, settings};
use uuid::Uuid;

use super::{read_live, *};
use crate::api::{PresetEntry, PresetError, PresetErrorKind, PresetPatch, Settings};

/// The most presets *Add preset* allows.
pub(crate) const MAX_PRESETS: usize = 12;
const NEW_PRESET_NAME: &str = "New preset";

/// What a successful edit hands the caller to publish after unlock.
#[derive(Debug, Clone, PartialEq)]
pub struct Edited {
    /// The live library after the edit.
    pub presets: Vec<PresetEntry>,
    /// The edited or added preset, for `preset_add` and `preset_update`.
    pub entry: Option<PresetEntry>,
    /// The presented settings, when the edit moved the selection (for `settings-changed`).
    pub selection_moved: Option<Settings>,
}

fn error(kind: PresetErrorKind, message: impl Into<String>) -> PresetError {
    PresetError {
        kind,
        field: None,
        message: message.into(),
    }
}

fn invalid(field: PresetField) -> PresetError {
    let what = match field {
        PresetField::Name => "a name needs 1 to 40 characters",
        PresetField::FocusMin => "focus can be 5 to 180 minutes",
        PresetField::BreakMin => "a break can be 1 to 60 minutes",
        PresetField::LongBreakMin => "a long break can be 5 to 90 minutes",
        PresetField::Rounds => "a long break can come after 1 to 8 sessions",
    };
    PresetError {
        kind: PresetErrorKind::Invalid,
        field: Some(field),
        message: what.into(),
    }
}

fn duplicate(name: &str) -> PresetError {
    error(
        PresetErrorKind::DuplicateName,
        format!("another preset is called {name}"),
    )
}

fn write_failed(error: StoreError) -> PresetError {
    eprintln!("presets: the edit could not be saved ({error})");
    self::error(PresetErrorKind::Write, "presets couldn't be saved")
}

fn same_name(a: &str, b: &str) -> bool {
    a.to_lowercase() == b.to_lowercase()
}

impl SessionService {
    /// Refuses an edit while the library is not stored: no store, or the load is owed.
    fn require_writable(&self) -> Result<(), PresetError> {
        if self.store.is_none() || self.recover_owed.presets {
            return Err(error(
                PresetErrorKind::Unavailable,
                "presets can't be changed right now",
            ));
        }
        Ok(())
    }

    fn name_taken(&self, name: &str, except: Option<&PresetId>) -> bool {
        self.presets
            .iter()
            .any(|p| Some(&p.id) != except && same_name(&p.name, name))
    }

    /// Runs `edit` with every row (removed ones included) in one transaction with anything
    /// owed, then adopts the live presets it read back. `edit` returns the id the selection
    /// should move to, if it must.
    fn write_library(
        &mut self,
        now_ms: u64,
        edit: impl FnOnce(&mut Txn) -> Result<Option<PresetId>, StoreError>,
    ) -> Result<Option<Settings>, PresetError> {
        let mut outcome = None;
        self.write_owed(now_ms, |txn| {
            let moved = edit(txn)?;
            if let Some(id) = &moved {
                settings::set(txn, KEY_PRESET, id)?;
            }
            outcome = Some((moved, read_live(txn)?));
            Ok(())
        })
        .map_err(write_failed)?;
        let Some((moved, live)) = outcome else {
            return Ok(None);
        };
        self.presets = live;
        self.refresh_status();
        Ok(moved.map(|id| {
            self.settings.preset_id = id;
            self.settings()
        }))
    }

    fn edited(&self, entry: Option<&PresetId>, moved: Option<Settings>) -> Edited {
        let presets = self.presets();
        Edited {
            entry: entry.and_then(|id| presets.iter().find(|e| &e.id == id).cloned()),
            presets,
            selection_moved: moved,
        }
    }

    /// `preset_add`: "New preset" with Steady Focus's lengths, after every row there is.
    pub fn preset_add(&mut self, now_ms: u64) -> Result<Edited, PresetError> {
        self.require_writable()?;
        if self.presets.len() >= MAX_PRESETS {
            return Err(error(PresetErrorKind::Limit, "up to 12 presets"));
        }
        let base = &default_presets()[1];
        let mut name = NEW_PRESET_NAME.to_string();
        let mut n = 1;
        while self.name_taken(&name, None) {
            n += 1;
            name = format!("{NEW_PRESET_NAME} {n}");
        }
        let def = PresetDef {
            id: PresetId(Uuid::now_v7().to_string()),
            name,
            default_key: None,
            ..base.clone()
        };
        let id = def.id.clone();
        self.write_library(now_ms, |txn| {
            let position = presets::list_with_removed(txn)?
                .iter()
                .map(|p| p.position + 1)
                .max()
                .unwrap_or(0);
            presets::insert(
                txn,
                &StoredPreset {
                    def,
                    position,
                    deleted_at: None,
                },
            )?;
            Ok(None)
        })?;
        Ok(self.edited(Some(&id), None))
    }

    /// `preset_update`: applies the given fields after validating the whole preset.
    pub fn preset_update(
        &mut self,
        id: &PresetId,
        patch: PresetPatch,
        now_ms: u64,
    ) -> Result<Edited, PresetError> {
        self.require_writable()?;
        let Some(current) = self.presets.iter().find(|p| &p.id == id) else {
            return Err(error(PresetErrorKind::NotFound, "that preset is gone"));
        };
        let mut def = current.clone();
        if let Some(raw) = &patch.name {
            def.name = normalize_name(raw).ok_or_else(|| invalid(PresetField::Name))?;
        }
        def.focus_min = patch.focus_min.unwrap_or(def.focus_min);
        def.break_min = patch.break_min.unwrap_or(def.break_min);
        def.long_break_min = patch.long_break_min.unwrap_or(def.long_break_min);
        def.rounds = patch.rounds.unwrap_or(def.rounds);
        def.validate().map_err(|bad| invalid(bad.field))?;
        if self.name_taken(&def.name, Some(id)) {
            return Err(duplicate(&def.name));
        }
        self.write_library(now_ms, |txn| {
            let stored = presets::get(txn, &def.id)?
                .ok_or_else(|| StoreError::Sqlite(format!("no preset with id {}", def.id.0)))?;
            presets::update(txn, &StoredPreset { def, ..stored })?;
            Ok(None)
        })?;
        Ok(self.edited(Some(id), None))
    }

    /// `preset_remove`: tombstones the preset; the selection moves to the first remaining one
    /// when it was the removed one.
    pub fn preset_remove(&mut self, id: &PresetId, now_ms: u64) -> Result<Edited, PresetError> {
        self.require_writable()?;
        if !self.presets.iter().any(|p| &p.id == id) {
            return Err(error(PresetErrorKind::NotFound, "that preset is gone"));
        }
        if self.presets.len() <= 1 {
            return Err(error(
                PresetErrorKind::LastPreset,
                "at least one preset stays",
            ));
        }
        let next = (self.selected().id == *id)
            .then(|| {
                self.presets
                    .iter()
                    .find(|p| &p.id != id)
                    .map(|p| p.id.clone())
            })
            .flatten();
        let moved = self.write_library(now_ms, |txn| {
            presets::remove(txn, id)?;
            Ok(next)
        })?;
        Ok(self.edited(None, moved))
    }

    /// `preset_undo_remove`: brings a removed preset back, unless its name is taken now.
    pub fn preset_undo_remove(
        &mut self,
        id: &PresetId,
        now_ms: u64,
    ) -> Result<Edited, PresetError> {
        self.require_writable()?;
        let stored = self
            .store
            .as_ref()
            .map(|store| store.read(|txn| presets::get(txn, id)))
            .transpose()
            .map_err(write_failed)?
            .flatten();
        let Some(stored) = stored else {
            return Err(error(PresetErrorKind::NotFound, "that preset is gone"));
        };
        if stored.deleted_at.is_none() {
            return Ok(self.edited(Some(id), None));
        }
        if self.name_taken(&stored.def.name, None) {
            return Err(duplicate(&stored.def.name));
        }
        self.write_library(now_ms, |txn| {
            presets::undelete(txn, id)?;
            Ok(None)
        })?;
        Ok(self.edited(Some(id), None))
    }

    /// `presets_restore_defaults`: brings the three defaults back at their positions with
    /// their shipped name and lengths. Leaves the user's presets alone and may pass 12.
    pub fn presets_restore_defaults(&mut self, now_ms: u64) -> Result<Edited, PresetError> {
        self.require_writable()?;
        let defaults = default_presets();
        let taken = defaults.iter().find(|d| {
            let live_default = self.presets.iter().any(|p| p.id == d.id);
            !live_default
                && self
                    .presets
                    .iter()
                    .any(|p| p.default_key.is_none() && same_name(&p.name, &d.name))
        });
        if let Some(d) = taken {
            return Err(duplicate(&d.name));
        }
        self.write_library(now_ms, |txn| {
            let others: Vec<_> = presets::list_with_removed(txn)?
                .into_iter()
                .filter(|p| !defaults.iter().any(|d| d.id == p.def.id))
                .collect();
            for (position, def) in (0u32..).zip(&defaults) {
                let restored = StoredPreset {
                    def: def.clone(),
                    position,
                    deleted_at: None,
                };
                match presets::get(txn, &def.id)? {
                    None => presets::insert(txn, &restored)?,
                    Some(stored) => {
                        presets::update(txn, &restored)?;
                        if stored.deleted_at.is_some() {
                            presets::undelete(txn, &def.id)?;
                        }
                    }
                }
            }
            // The user's presets follow the defaults, in the order they had.
            for (position, mut other) in (3u32..).zip(others) {
                if other.position != position {
                    other.position = position;
                    presets::update(txn, &other)?;
                }
            }
            Ok(None)
        })?;
        Ok(self.edited(None, None))
    }
}
