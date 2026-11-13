//! Import: merges the rows of another Orasenda data file into the live store (spec 2026-11-12,
//! sub-project G). The user's file is only read; a copy of it is opened and migrated.

use std::panic::{self, AssertUnwindSafe};
use std::path::{Path, PathBuf};

use orasenda_store::portability::{ProbeError, SyncRows, merge, probe, rows};
use orasenda_store::{OpenError, SCHEMA_VERSION, Store};
use uuid::Uuid;

use super::{backups, cap};
use crate::api::{BackupKind, DataCounts, DataError, DataErrorKind, ImportReport};
use crate::scheduler::{self, Host};
use crate::session::{DB_FILE, lock};

/// Merges the data file `source` into the live store. Refuses with `Busy` while a session
/// runs. Takes a `before-import` backup first, always, then merges in one write and keeps
/// the preset library under its cap. Afterwards the service reloads and the host applies the
/// theme and emits `settings-changed` and `presets-changed`, plus `inbox-changed` when notes
/// were added or updated. `dir` is the app data dir.
///
/// The service stays locked from the copy until the reload, so no session can start between
/// the check and the write.
///
/// The merge may change `keys.start_pause` and `keys.capture`. On `Ok` the caller must call
/// `KeyboardService::register_saved(host)`, so the OS shortcuts follow the imported keys.
pub fn run_import<H: Host>(host: &H, dir: &Path, source: &Path) -> Result<ImportReport, DataError> {
    let service = host.service().ok_or_else(unavailable)?;
    let now_ms = host.now_ms();
    let (report, published) = {
        let mut guard = lock(service);
        if guard.session_active(now_ms) {
            return Err(DataError::new(DataErrorKind::Busy, "end the session first"));
        }
        let store = guard.store().ok_or_else(unavailable)?;
        let incoming = read_source(store, dir, source)?;
        backups::create(store, dir, BackupKind::BeforeImport, now_ms)?;
        let merged = store
            .write(now_ms, |txn| {
                let counts = merge(txn, &incoming)?;
                cap::enforce_preset_cap(txn)?;
                Ok(counts)
            })
            .map_err(|error| {
                DataError::new(DataErrorKind::Write, format!("cannot import: {error}"))
            })?;
        guard.reload_after_import(now_ms);
        let notes_changed = merged.added.notes + merged.updated.notes > 0;
        let notes = if notes_changed {
            guard
                .inbox_live(now_ms)
                .map_err(|error| eprintln!("import: could not read the notes back ({error})"))
                .ok()
        } else {
            None
        };
        let report = ImportReport {
            added: DataCounts::from(merged.added),
            updated: DataCounts::from(merged.updated),
        };
        let published = Published {
            settings: guard.settings(),
            presets: guard.presets(),
            notes,
            view: guard.snapshot(now_ms),
        };
        (report, published)
    };
    publish(host, &published);
    Ok(report)
}

struct Published {
    settings: crate::api::Settings,
    presets: Vec<crate::api::PresetEntry>,
    notes: Option<Vec<crate::api::NoteView>>,
    view: (u64, crate::api::TimerView),
}

/// The import is committed, so a panic while publishing is logged, never a failure.
fn publish<H: Host>(host: &H, published: &Published) {
    let result = panic::catch_unwind(AssertUnwindSafe(|| {
        host.apply_theme(published.settings.theme);
        host.emit_presets_changed(&published.presets);
        if let Some(notes) = &published.notes {
            host.emit_inbox_changed(notes);
        }
        scheduler::publish_view(host, published.view.0, &published.view.1);
        scheduler::publish_clock(host);
        host.emit_settings_changed(&published.settings);
    }));
    if result.is_err() {
        eprintln!("import: publishing panicked; the import stands");
    }
}

/// Probes `source`, copies it (with any `-wal` and `-shm` beside it, so uncheckpointed
/// commits come along) to `import-<uuid>.db`, opens only the copy (migrations run on it) and
/// reads its rows. The copy is removed on every path. When `source` is the live file itself,
/// the copy is a consistent snapshot of the store instead.
fn read_source(live: &Store, dir: &Path, source: &Path) -> Result<SyncRows, DataError> {
    let copy = dir.join(format!("import-{}.db", Uuid::now_v7()));
    let _cleanup = Cleanup(copy.clone());
    if is_live_file(dir, source) {
        live.snapshot_to(&copy).map_err(write_error)?;
        check(&copy)?;
    } else {
        check(source)?;
        for suffix in ["", "-wal", "-shm"] {
            let from = with_suffix(source, suffix);
            if suffix.is_empty() || from.is_file() {
                let mut input =
                    std::fs::File::open(&from).map_err(|error| unreadable(error.to_string()))?;
                let mut output =
                    std::fs::File::create(with_suffix(&copy, suffix)).map_err(write_error)?;
                std::io::copy(&mut input, &mut output).map_err(write_error)?;
            }
        }
    }
    let store = Store::open(&copy, "import").map_err(|error| match error {
        OpenError::Newer { .. } => newer(),
        other => unreadable(other.to_string()),
    })?;
    store
        .read(rows)
        .map_err(|error| unreadable(error.to_string()))
}

/// Refuses a file that is not Orasenda data, or is from a newer Orasenda.
fn check(path: &Path) -> Result<(), DataError> {
    let probed = probe(path).map_err(|error| match error {
        ProbeError::NotSqlite => not_orasenda(),
        ProbeError::Io(message) => unreadable(message),
    })?;
    if probed.user_version == 0 || !probed.has_device_id {
        return Err(not_orasenda());
    }
    if probed.user_version > SCHEMA_VERSION {
        return Err(newer());
    }
    Ok(())
}

fn is_live_file(dir: &Path, source: &Path) -> bool {
    match (
        std::fs::canonicalize(source),
        std::fs::canonicalize(dir.join(DB_FILE)),
    ) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Removes the working copy and its `-wal` and `-shm` when dropped.
struct Cleanup(PathBuf);

impl Drop for Cleanup {
    fn drop(&mut self) {
        for suffix in ["", "-wal", "-shm"] {
            let path = with_suffix(&self.0, suffix);
            if let Err(error) = std::fs::remove_file(&path)
                && error.kind() != std::io::ErrorKind::NotFound
            {
                eprintln!("import: could not remove {} ({error})", path.display());
            }
        }
    }
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

fn write_error(error: impl std::fmt::Display) -> DataError {
    DataError::new(
        DataErrorKind::Write,
        format!("cannot make a working copy: {error}"),
    )
}

fn unavailable() -> DataError {
    DataError::new(DataErrorKind::Unavailable, "your data isn't open right now")
}

fn newer() -> DataError {
    DataError::new(
        DataErrorKind::Newer,
        "this file was saved by a newer Orasenda",
    )
}

fn not_orasenda() -> DataError {
    DataError::new(
        DataErrorKind::NotOrasenda,
        "this isn't an Orasenda data file",
    )
}

fn unreadable(message: String) -> DataError {
    DataError::new(
        DataErrorKind::Unreadable,
        format!("cannot read the file: {message}"),
    )
}
