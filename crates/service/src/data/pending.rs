//! The pending swap: files in the app data dir that Restore and Delete all data leave for the
//! next launch, applied before the store opens.

use std::path::{Path, PathBuf};

use super::backups;
use crate::api::{DataError, DataErrorKind};

const DB: &str = "orasenda.db";
const RESTORE: &str = "orasenda.restore.db";
const DELETE: &str = "orasenda.delete";

/// What [`apply_pending`] did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PendingOutcome {
    None,
    Restored,
    Deleted,
}

fn suffixed(path: &Path, suffix: &str) -> PathBuf {
    let mut text = path.as_os_str().to_owned();
    text.push(suffix);
    PathBuf::from(text)
}

fn remove_if_present(path: &Path) -> std::io::Result<()> {
    match std::fs::remove_file(path) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

/// Applies a staged delete or restore, then clears leftovers. The delete marker wins over a
/// restore. A failure is logged and leaves the files for the next launch.
pub fn apply_pending(dir: &Path) -> PendingOutcome {
    remove_leftovers(dir);
    match swap(dir) {
        Ok(outcome) => outcome,
        Err(error) => {
            eprintln!("pending: could not apply the swap ({error}); trying again next launch");
            PendingOutcome::None
        }
    }
}

fn swap(dir: &Path) -> std::io::Result<PendingOutcome> {
    let (db, restore, marker) = (dir.join(DB), dir.join(RESTORE), dir.join(DELETE));
    let deleting = marker.is_file();
    if !deleting && !restore.is_file() {
        return Ok(PendingOutcome::None);
    }
    // The side files first: a stale -wal must never meet the other database.
    remove_if_present(&suffixed(&db, "-wal"))?;
    remove_if_present(&suffixed(&db, "-shm"))?;
    if deleting {
        remove_if_present(&db)?;
        remove_if_present(&restore)?;
        remove_if_present(&marker)?;
        return Ok(PendingOutcome::Deleted);
    }
    // The rename replaces `orasenda.db` in one step: no moment without data.
    std::fs::rename(&restore, &db)?;
    Ok(PendingOutcome::Restored)
}

/// Deletes `.partial` files and temporary `import-*.db` copies a crash left behind.
fn remove_leftovers(dir: &Path) {
    let folder = backups::folder(dir);
    for place in [dir, folder.as_path()] {
        let Ok(read) = std::fs::read_dir(place) else {
            continue;
        };
        for item in read.flatten() {
            let Some(name) = item.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let ours = name.starts_with("orasenda") && name.ends_with(".partial");
            let import = place == dir && name.starts_with("import-") && name.ends_with(".db");
            if (ours || import)
                && item.path().is_file()
                && let Err(error) = std::fs::remove_file(item.path())
            {
                eprintln!("pending: could not remove {name} ({error})");
            }
        }
    }
}

/// Stages the listed backup `backup` for the next launch: a copy to `orasenda.restore.db.partial`,
/// then a rename. `NotFound` for a name `list` doesn't return, `Newer` for a newer one.
pub fn stage_restore(dir: &Path, backup: &str) -> Result<(), DataError> {
    let entry = backups::list(dir)
        .into_iter()
        .find(|entry| entry.file == backup)
        .ok_or_else(|| DataError::new(DataErrorKind::NotFound, "that backup is gone"))?;
    if entry.newer {
        return Err(DataError::new(
            DataErrorKind::Newer,
            "This backup was saved by a newer Orasenda.",
        ));
    }
    let (restore, partial) = (dir.join(RESTORE), dir.join(format!("{RESTORE}.partial")));
    let staged = std::fs::copy(backups::folder(dir).join(backup), &partial)
        .and_then(|_| std::fs::rename(&partial, &restore))
        // A stale delete marker would win over this restore.
        .and_then(|()| remove_if_present(&dir.join(DELETE)));
    staged.map_err(|error| {
        let _ = std::fs::remove_file(&partial);
        backups::write_error(error)
    })
}

/// Leaves the empty marker that makes the next launch start fresh.
pub fn stage_delete(dir: &Path) -> Result<(), DataError> {
    std::fs::write(dir.join(DELETE), b"").map_err(backups::write_error)
}
