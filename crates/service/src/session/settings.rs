//! The cached settings: the launch read, saving, and the notify review.

use orasenda_core::{NotificationStatus, Preset};
use orasenda_store::{StoreError, Txn, meta, settings};
use serde::de::DeserializeOwned;

use super::*;
use crate::api::{Settings, SettingsError, SettingsErrorKind, StoreStatus, Theme};

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
pub(super) const KEY_PRESET: &str = "timer.preset";
pub(super) const KEY_CUSTOM: &str = "timer.custom";
pub(super) const KEY_NOTIFY: &str = "notify.session_end";
pub(super) const KEY_THEME: &str = "ui.theme";
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
        if settings.preset == Preset::Quick {
            return Err(SettingsError {
                kind: SettingsErrorKind::InvalidSpec,
                message: "the 2-minute start can't be the saved preset".into(),
            });
        }
        if let Err(error) = settings.custom.validate() {
            return Err(SettingsError {
                kind: SettingsErrorKind::InvalidSpec,
                message: error.to_string(),
            });
        }
        if self.store.is_none() {
            return Err(SettingsError {
                kind: SettingsErrorKind::Unavailable,
                message: "settings can't be saved right now".into(),
            });
        }
        let presented = self.settings();
        let owed = self.recover_owed.settings;
        let theme_changed = settings.theme != presented.theme;
        let preset_changed = settings.preset != presented.preset;
        let custom_changed = settings.custom != presented.custom;
        let notify_changed = settings.notify_session_end != presented.notify_session_end;
        // While the launch read is owed, the stored values are read inside this transaction
        // (the store is reachable, since it is being written) and the changes go on top.
        let mut stored: Option<(Settings, bool)> = None;
        self.write_owed(now_ms, |txn| {
            if owed {
                stored = Some(read_settings(txn)?);
            }
            if preset_changed {
                settings::set(txn, KEY_PRESET, &settings.preset)?;
            }
            if custom_changed {
                settings::set(txn, KEY_CUSTOM, &settings.custom)?;
            }
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
        if preset_changed {
            self.settings.preset = settings.preset;
        }
        if custom_changed {
            self.settings.custom = settings.custom;
        }
        // An echoed value is not copied into the cache while the review is pending: the cache
        // keeps the stored-or-true value the review will use.
        if notify_changed {
            self.settings.notify_session_end = settings.notify_session_end;
            self.review_pending = false;
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

/// Reads the settings. A value that fails to decode, a saved `Quick` and an out-of-range
/// Custom are logged and replaced by their default in memory, never rewritten. A database
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
    let mut preset = read_setting(txn, KEY_PRESET, defaults.preset)?;
    if preset == Preset::Quick {
        eprintln!("settings: {KEY_PRESET} is quick, which is never saved; using the default");
        preset = defaults.preset;
    }
    let mut custom = read_setting(txn, KEY_CUSTOM, defaults.custom)?;
    if custom.validate().is_err() {
        eprintln!("settings: {KEY_CUSTOM} is out of range; using the default");
        custom = defaults.custom;
    }
    let notify_default = pending || defaults.notify_session_end;
    let settings = Settings {
        theme: read_setting(txn, KEY_THEME, defaults.theme)?,
        preset,
        custom,
        notify_session_end: read_setting(txn, KEY_NOTIFY, notify_default)?,
    };
    Ok((settings, pending))
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
