//! The `Backups/` folder: list, create, delete, prune and the due check. Only files whose name
//! matches the backup pattern are ever listed, pruned or dropped.

use std::path::{Path, PathBuf};

use orasenda_store::portability::{ProbeError, probe};
use orasenda_store::{SCHEMA_VERSION, Store};

use super::names;
use super::policy;
use crate::api::{
    BackupEntry, BackupFrequency, BackupKind, BackupPolicy, DataError, DataErrorKind,
};

const MS_PER_DAY: u64 = 86_400_000;

/// The folder backups live in.
pub fn folder(dir: &Path) -> PathBuf {
    dir.join("Backups")
}

/// The backups, newest first. A backup-named file that is not SQLite or has no `device_id` is
/// deleted and not returned. A file that can't be read at all is skipped and left alone.
pub fn list(dir: &Path) -> Vec<BackupEntry> {
    let folder = folder(dir);
    let Ok(read) = std::fs::read_dir(&folder) else {
        return Vec::new();
    };
    let mut found = Vec::new();
    for item in read.flatten() {
        let Some(file) = item.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        let Some((created_ms, kind, number)) = names::parse(&file) else {
            continue;
        };
        let path = item.path();
        let Ok(meta) = std::fs::metadata(&path) else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        match probe(&path) {
            Ok(probed) if probed.has_device_id && probed.user_version >= 1 => {
                found.push((
                    number,
                    BackupEntry {
                        file,
                        kind,
                        created_ms,
                        bytes: meta.len(),
                        newer: probed.user_version > SCHEMA_VERSION,
                    },
                ));
            }
            Ok(_) | Err(ProbeError::NotSqlite) => {
                if let Err(error) = std::fs::remove_file(&path) {
                    eprintln!("backups: could not drop {file} ({error})");
                }
            }
            Err(ProbeError::Io(error)) => eprintln!("backups: could not read {file} ({error})"),
        }
    }
    // Newest first; within one second the higher clash number was made later.
    found.sort_by_key(|a| std::cmp::Reverse((a.1.created_ms, a.0)));
    found.into_iter().map(|(_, entry)| entry).collect()
}

/// Snapshots the store into `Backups/`, then prunes to the policy's `keep` across every kind.
/// The new backup is never pruned.
pub fn create(
    store: &Store,
    dir: &Path,
    kind: BackupKind,
    now_ms: u64,
) -> Result<BackupEntry, DataError> {
    let folder = folder(dir);
    std::fs::create_dir_all(&folder).map_err(write_error)?;
    let file = names::unique(&folder, now_ms, kind);
    let path = folder.join(&file);
    store.snapshot_to(&path).map_err(write_error)?;
    let bytes = std::fs::metadata(&path).map_err(write_error)?.len();
    let created_ms = names::parse(&file).map_or(now_ms, |(ms, _, _)| ms);
    prune_keeping(dir, policy::read(store).keep, Some(&file));
    Ok(BackupEntry {
        file,
        kind,
        created_ms,
        bytes,
        newer: false,
    })
}

/// Deletes the listed backup `file`. Any other name, including one with a path, is `NotFound`.
pub fn delete(dir: &Path, file: &str) -> Result<(), DataError> {
    let not_found = || DataError::new(DataErrorKind::NotFound, "that backup is gone");
    if file.contains(['/', '\\']) || file.contains("..") {
        return Err(not_found());
    }
    if !list(dir).iter().any(|entry| entry.file == file) {
        return Err(not_found());
    }
    std::fs::remove_file(folder(dir).join(file)).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            not_found()
        } else {
            write_error(error)
        }
    })
}

/// True when the newest `auto` backup is at least 30 days (monthly) or 91 days (quarterly) old,
/// or there is none. Manual and safety backups don't count.
pub fn due(entries: &[BackupEntry], policy: &BackupPolicy, now_ms: u64) -> bool {
    let days = match policy.frequency {
        BackupFrequency::Monthly => 30,
        BackupFrequency::Quarterly => 91,
    };
    entries
        .iter()
        .filter(|entry| entry.kind == BackupKind::Auto)
        .map(|entry| entry.created_ms)
        .max()
        .is_none_or(|newest| now_ms.saturating_sub(newest) >= days * MS_PER_DAY)
}

/// Deletes the oldest backups, of every kind, until `keep` remain.
pub fn prune(dir: &Path, keep: u32) {
    prune_keeping(dir, keep, None);
}

/// [`prune`], but the backup named `protect` always stays (and counts toward `keep`).
fn prune_keeping(dir: &Path, keep: u32, protect: Option<&str>) {
    // The protected backup takes one of the `keep` places, wherever it sorts.
    let slots = (keep.max(1) as usize).saturating_sub(usize::from(protect.is_some()));
    let mut kept = 0;
    for entry in list(dir) {
        if protect == Some(entry.file.as_str()) {
            continue;
        }
        if kept < slots {
            kept += 1;
            continue;
        }
        if let Err(error) = std::fs::remove_file(folder(dir).join(&entry.file)) {
            eprintln!("backups: could not prune {} ({error})", entry.file);
        }
    }
}

pub(super) fn write_error(error: impl std::fmt::Display) -> DataError {
    DataError::new(
        DataErrorKind::Write,
        format!("cannot write the backup: {error}"),
    )
}
