//! The cached settings: the launch read, saving, and the notify review.

use orasenda_core::{NotificationStatus, PresetId};
use orasenda_store::{StoreError, Txn, meta, settings};
use serde::de::DeserializeOwned;

use super::*;
use crate::api::{Settings, SettingsError, SettingsErrorKind, ShortcutId, StoreStatus, Theme};

/// What a successful settings save tells the caller, for the side effects after unlock.
#[derive(Debug, Clone, PartialEq)]
pub struct SettingsSaved {
    /// The cached theme after the save when it differs from the presented theme before it,
    /// whether the user changed it or a save that settled the owed read adopted it. Gates
    /// `apply_theme`.
    pub theme: Option<Theme>,
    /// The presented settings after the save, for `settings-changed`.
    pub presented: Settings,
}

/// Settings keys (spec: Store).
pub(crate) const KEY_PRESET: &str = "timer.preset";
pub(super) const KEY_EXTENSION_CAP: &str = "timer.extension_cap";
pub(super) const KEY_AUTO_CONTINUE: &str = "timer.auto_continue";
pub(super) const KEY_LONGEST_FOCUS: &str = "timer.longest_focus_min";
pub(super) const KEY_DEEP_CAP_ON: &str = "timer.deep_cap_on";
pub(super) const KEY_DEEP_CAP_HOURS: &str = "timer.deep_cap_hours";
pub(super) const KEY_NOTIFY: &str = "notify.session_end";
pub(super) const KEY_NOTIFY_TWO: &str = "notify.two_minutes";
pub(super) const KEY_THEME: &str = "ui.theme";
pub(super) const KEY_START_PAUSE: &str = "keys.start_pause";
pub(super) const KEY_CAPTURE: &str = "keys.capture";
pub(super) const KEY_SINGLE_KEY: &str = "keys.single_key";
pub(super) const META_NOTIFY_REVIEW: &str = "notify_review";

impl SessionService {
    /// The launch read of the settings. A failure keeps the defaults for now, owes the read
    /// to `tick` and shows the store as unavailable.
    pub(super) fn load_settings(&mut self, read: Result<(Settings, bool), StoreError>) {
        match read {
            Ok((settings, pending)) => {
                self.settings = settings;
                self.review_pending = pending;
            }
            Err(error) => {
                eprintln!("settings: could not be read ({error}); using the defaults for now");
                self.recover_owed.settings = true;
                self.store_status = StoreStatus::Unavailable;
            }
        }
    }

    /// The one-time notify review of a pre-B database. Runs when the marker is pending and a
    /// status is known (`granted`, `denied` or `notDetermined`; `unavailable` leaves it
    /// pending). Writes `notify.session_end = (stored value, or true when absent) && granted`
    /// together with the marker's removal, in one transaction. A no-op once done. Returns true
    /// when it wrote; the caller must then emit one `settings-changed` after unlock.
    ///
    /// A failed write keeps the reviewed value in the cache and the marker on disk; the next
    /// launch reviews again, and this run does not retry. `store_status` calls it.
    ///
    /// Accepted race (plan ruling 5): a theme or preset save sent between this write and its
    /// `settings-changed` can carry the pre-review `notifySessionEnd` and undo the review. The
    /// window is milliseconds and the outcome is visible on the page.
    pub fn run_notify_review(&mut self, now_ms: u64) -> bool {
        // A write while the snapshot is still owed would treat the running session as unread.
        if !self.review_pending || self.recover_owed.snapshot {
            return false;
        }
        let Some(
            status @ (NotificationStatus::Granted
            | NotificationStatus::Denied
            | NotificationStatus::NotDetermined),
        ) = self.notifications
        else {
            return false;
        };
        let value = self.settings.notify_session_end && status == NotificationStatus::Granted;
        self.settings.notify_session_end = value;
        self.review_pending = false;
        let written = self.write_owed(now_ms, |txn| {
            settings::set(txn, KEY_NOTIFY, &value)?;
            meta::remove(txn, META_NOTIFY_REVIEW)
        });
        match written {
            Ok(()) => true,
            Err(error) => {
                eprintln!("settings: the notify review could not be saved ({error})");
                false
            }
        }
    }

    /// Validates, then writes only the keys that differ from the presented settings, in one
    /// transaction with anything owed, and updates the cache. A `notifySessionEnd` that
    /// differs from the presented value also removes the review marker (the user's choice
    /// wins). While the launch read of the settings is owed, the stored settings and marker are
    /// read in the same transaction and only the changed keys are written on top; the read is
    /// then no longer owed, and a pending review runs at once if a status is known.
    pub fn set_settings(
        &mut self,
        settings: Settings,
        now_ms: u64,
    ) -> Result<SettingsSaved, SettingsError> {
        if let Some(message) = self.invalid(&settings) {
            return Err(SettingsError {
                kind: SettingsErrorKind::InvalidSpec,
                message: message.into(),
            });
        }
        if self.store.is_none() {
            return Err(SettingsError {
                kind: SettingsErrorKind::Unavailable,
                message: "settings can't be saved right now".into(),
            });
        }
        let presented = self.settings();
        // While the library is owed the presented id is a stand-in for the cached one (the guard
        // below lets only an echo of it through), so the cached id is left alone.
        let cached_preset = if self.recover_owed.presets {
            presented.preset_id.clone()
        } else {
            self.settings.preset_id.clone()
        };
        let owed = self.recover_owed.settings;
        let theme_changed = settings.theme != presented.theme;
        let notify_changed = settings.notify_session_end != presented.notify_session_end;
        if settings.preset_id != presented.preset_id && self.recover_owed.presets {
            return Err(SettingsError {
                kind: SettingsErrorKind::Unavailable,
                message: "the preset can't be changed right now".into(),
            });
        }
        // While the launch read is owed, the stored values are read inside this transaction
        // (the store is reachable, since it is being written) and the changes go on top.
        let mut stored: Option<(Settings, bool)> = None;
        self.write_owed(now_ms, |txn| {
            if owed {
                stored = Some(read_settings(txn)?);
            }
            write_changed(txn, &presented, &cached_preset, &settings)?;
            if theme_changed {
                settings::set(txn, KEY_THEME, &settings.theme)?;
            }
            if notify_changed {
                settings::set(txn, KEY_NOTIFY, &settings.notify_session_end)?;
                meta::remove(txn, META_NOTIFY_REVIEW)?;
            }
            Ok(())
        })
        .map_err(|_| SettingsError {
            kind: SettingsErrorKind::Write,
            message: "settings couldn't be saved".into(),
        })?;
        if let Some((base, pending)) = stored {
            self.settings = base;
            self.review_pending = pending;
            self.recover_owed.settings = false;
        }
        if theme_changed {
            self.settings.theme = settings.theme;
        }
        merge_changed(&mut self.settings, &presented, &cached_preset, &settings);
        // An echoed value is not copied into the cache while the review is pending: the cache
        // keeps the stored-or-true value the review will use.
        if notify_changed {
            self.settings.notify_session_end = settings.notify_session_end;
            self.review_pending = false;
        }
        if self.settings.auto_continue {
            self.hint.pending = false;
        }
        // A known status is applied at once; the save's one event carries the outcome.
        if self.review_pending {
            self.run_notify_review(now_ms);
        }
        self.refresh_status();
        Ok(SettingsSaved {
            theme: (self.settings.theme != presented.theme).then_some(self.settings.theme),
            presented: self.settings(),
        })
    }
}

/// Reads the settings. A value that fails to decode and an out-of-range value are logged and replaced by their default in memory, never rewritten. A database
/// error fails the whole read.
/// Also reads the notify review marker in the same transaction; while it is pending an absent
/// `notify.session_end` reads `true` (spec A's default) so the review sees what A meant. The
/// flag is true when the marker is present: any value other than `pending` is logged and
/// counts as pending, the failure side.
pub(super) fn read_settings(txn: &Txn) -> Result<(Settings, bool), StoreError> {
    let defaults = Settings::default();
    let pending = match meta::get(txn, META_NOTIFY_REVIEW)? {
        None => false,
        Some(value) => {
            if value != "pending" {
                eprintln!("settings: {META_NOTIFY_REVIEW} is {value:?}; treating it as pending");
            }
            true
        }
    };
    let notify_default = pending || defaults.notify_session_end;
    let settings = Settings {
        theme: read_setting(txn, KEY_THEME, defaults.theme)?,
        preset_id: read_setting(txn, KEY_PRESET, defaults.preset_id)?,
        extension_cap: read_ranged(txn, KEY_EXTENSION_CAP, defaults.extension_cap, 0..=3)?,
        auto_continue: read_setting(txn, KEY_AUTO_CONTINUE, defaults.auto_continue)?,
        longest_focus_min: read_ranged(
            txn,
            KEY_LONGEST_FOCUS,
            defaults.longest_focus_min,
            60..=150,
        )?,
        deep_cap_on: read_setting(txn, KEY_DEEP_CAP_ON, defaults.deep_cap_on)?,
        deep_cap_hours: read_ranged(txn, KEY_DEEP_CAP_HOURS, defaults.deep_cap_hours, 2..=8)?,
        notify_session_end: read_setting(txn, KEY_NOTIFY, notify_default)?,
        notify_two_minutes: read_setting(txn, KEY_NOTIFY_TWO, defaults.notify_two_minutes)?,
        start_pause_keys: read_setting(txn, KEY_START_PAUSE, defaults.start_pause_keys)?,
        capture_keys: read_setting(txn, KEY_CAPTURE, defaults.capture_keys)?,
        single_key: read_setting(txn, KEY_SINGLE_KEY, defaults.single_key)?,
    };
    Ok((settings, pending))
}

/// A value that must lie in `range`; one outside it is logged and replaced by `default`.
fn read_ranged<T: DeserializeOwned + PartialOrd + Copy>(
    txn: &Txn,
    key: &str,
    default: T,
    range: std::ops::RangeInclusive<T>,
) -> Result<T, StoreError> {
    let value = read_setting(txn, key, default)?;
    if range.contains(&value) {
        Ok(value)
    } else {
        eprintln!("settings: {key} is out of range; using the default");
        Ok(default)
    }
}

/// Writes the keys of `new` that differ from `presented`, except the theme and the notify
/// choice, which `set_settings` writes with their own side effects.
///
/// The preset is compared with the cached id, not the presented one: the presented id resolves an
/// unknown id to the first live preset, and an explicit pick of that fallback must still be written.
fn write_changed(
    txn: &mut Txn,
    presented: &Settings,
    cached_preset: &PresetId,
    new: &Settings,
) -> Result<(), StoreError> {
    if new.preset_id != *cached_preset {
        settings::set(txn, KEY_PRESET, &new.preset_id)?;
    }
    if new.extension_cap != presented.extension_cap {
        settings::set(txn, KEY_EXTENSION_CAP, &new.extension_cap)?;
    }
    if new.auto_continue != presented.auto_continue {
        settings::set(txn, KEY_AUTO_CONTINUE, &new.auto_continue)?;
    }
    if new.longest_focus_min != presented.longest_focus_min {
        settings::set(txn, KEY_LONGEST_FOCUS, &new.longest_focus_min)?;
    }
    if new.deep_cap_on != presented.deep_cap_on {
        settings::set(txn, KEY_DEEP_CAP_ON, &new.deep_cap_on)?;
    }
    if new.deep_cap_hours != presented.deep_cap_hours {
        settings::set(txn, KEY_DEEP_CAP_HOURS, &new.deep_cap_hours)?;
    }
    if new.notify_two_minutes != presented.notify_two_minutes {
        settings::set(txn, KEY_NOTIFY_TWO, &new.notify_two_minutes)?;
    }
    if new.single_key != presented.single_key {
        settings::set(txn, KEY_SINGLE_KEY, &new.single_key)?;
    }
    Ok(())
}

/// Copies the fields `write_changed` wrote into the cache.
fn merge_changed(
    cache: &mut Settings,
    presented: &Settings,
    cached_preset: &PresetId,
    new: &Settings,
) {
    if new.preset_id != *cached_preset {
        cache.preset_id = new.preset_id.clone();
    }
    if new.extension_cap != presented.extension_cap {
        cache.extension_cap = new.extension_cap;
    }
    if new.auto_continue != presented.auto_continue {
        cache.auto_continue = new.auto_continue;
    }
    if new.longest_focus_min != presented.longest_focus_min {
        cache.longest_focus_min = new.longest_focus_min;
    }
    if new.deep_cap_on != presented.deep_cap_on {
        cache.deep_cap_on = new.deep_cap_on;
    }
    if new.deep_cap_hours != presented.deep_cap_hours {
        cache.deep_cap_hours = new.deep_cap_hours;
    }
    if new.notify_two_minutes != presented.notify_two_minutes {
        cache.notify_two_minutes = new.notify_two_minutes;
    }
    if new.single_key != presented.single_key {
        cache.single_key = new.single_key;
    }
}

impl SessionService {
    /// Saves a global shortcut's keys (`"off"` or a canonical accelerator) and updates the cache.
    /// This is the only way they change: `set_settings` ignores them, because a shortcut is saved
    /// only after it registered (`KeyboardService::set_shortcut`). Returns the presented settings.
    pub fn save_shortcut_keys(
        &mut self,
        id: ShortcutId,
        keys: &str,
        now_ms: u64,
    ) -> Result<Settings, StoreError> {
        let key = match id {
            ShortcutId::StartPause => KEY_START_PAUSE,
            ShortcutId::Capture => KEY_CAPTURE,
        };
        self.write_owed(now_ms, |txn| settings::set(txn, key, &keys))?;
        match id {
            ShortcutId::StartPause => self.settings.start_pause_keys = keys.into(),
            ShortcutId::Capture => self.settings.capture_keys = keys.into(),
        }
        self.refresh_status();
        Ok(self.settings())
    }

    /// Why `settings` can't be saved, if it can't: a preset that is not in the library, or a
    /// value outside its range.
    fn invalid(&self, settings: &Settings) -> Option<&'static str> {
        if !self.presets.iter().any(|p| p.id == settings.preset_id) {
            return Some("that preset isn't in the library");
        }
        if settings.extension_cap > 3 {
            return Some("extra 10 minutes can be off, once, twice or 3 times");
        }
        if !(60..=150).contains(&settings.longest_focus_min) {
            return Some("the longest focus can be 60 to 150 minutes");
        }
        if !(2..=8).contains(&settings.deep_cap_hours) {
            return Some("the deep-hours note can be set from 2 to 8 hours");
        }
        None
    }
}

fn read_setting<T: DeserializeOwned>(txn: &Txn, key: &str, default: T) -> Result<T, StoreError> {
    match settings::get::<T>(txn, key) {
        Ok(Some(value)) => Ok(value),
        Ok(None) => Ok(default),
        Err(StoreError::Json(error)) => {
            eprintln!("settings: {key} could not be decoded ({error}); using the default");
            Ok(default)
        }
        Err(error) => Err(error),
    }
}
