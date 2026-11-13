//! The backup policy: two device-only `meta` keys, like the hint flags (ADR-012).

use std::path::Path;

use orasenda_store::{Store, meta};

use super::backups::{prune, write_error};
use crate::api::{BackupFrequency, BackupPolicy, DataError, DataErrorKind};

const META_FREQUENCY: &str = "backup.frequency";
const META_KEEP: &str = "backup.keep";

/// The stored policy. A missing, unreadable or out-of-range value reads as its default.
pub fn read(store: &Store) -> BackupPolicy {
    let default = BackupPolicy::default();
    let get = |key: &str| match store.read(|txn| meta::get(txn, key)) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("backups: {key} could not be read ({error}); using the default");
            None
        }
    };
    BackupPolicy {
        frequency: match get(META_FREQUENCY).as_deref() {
            Some("quarterly") => BackupFrequency::Quarterly,
            _ => default.frequency,
        },
        keep: get(META_KEEP)
            .and_then(|text| text.parse::<u32>().ok())
            .filter(|keep| (1..=50).contains(keep))
            .unwrap_or(default.keep),
    }
}

/// Writes both keys in one write. `keep` must be 1 to 50. Returns what is stored now.
pub fn write(store: &Store, policy: &BackupPolicy, now_ms: u64) -> Result<BackupPolicy, DataError> {
    if !(1..=50).contains(&policy.keep) {
        return Err(DataError::new(
            DataErrorKind::Write,
            "Keep must be a whole number from 1 to 50",
        ));
    }
    let frequency = match policy.frequency {
        BackupFrequency::Monthly => "monthly",
        BackupFrequency::Quarterly => "quarterly",
    };
    store
        .write(now_ms, |txn| {
            meta::set(txn, META_FREQUENCY, frequency)?;
            meta::set(txn, META_KEEP, &policy.keep.to_string())
        })
        .map_err(write_error)?;
    Ok(read(store))
}

/// [`write`], then prunes `dir` to the new `keep` at once.
pub fn apply(
    store: &Store,
    dir: &Path,
    policy: &BackupPolicy,
    now_ms: u64,
) -> Result<BackupPolicy, DataError> {
    let stored = write(store, policy, now_ms)?;
    prune(dir, stored.keep);
    Ok(stored)
}
