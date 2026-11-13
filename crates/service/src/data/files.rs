//! Export and import of a data file the user picks (spec 2026-11-12, sub-project G). The panel
//! belongs to the app, so each function takes a `pick` closure; the service never names a
//! dialog. Nothing here touches the disk before the user has chosen a file.

use std::path::PathBuf;

use super::import::{is_live_file, run_import};
use super::names::civil_from_days;
use super::{busy, run};
use crate::api::{DataError, DataErrorKind, ExportOutcome, ImportOutcome};
use crate::keyboard::KeyboardService;
use crate::scheduler::Host;
use crate::session::lock;

const MINUTE_MS: u64 = 60_000;
const DAY_MIN: u64 = 1_440;

/// The Save panel's default name for `now_ms`: `Orasenda data <YYYY-MM-DD>.db` in local time.
pub fn export_name(now_ms: u64, utc_offset_min: i32) -> String {
    let minutes = (now_ms / MINUTE_MS).saturating_add_signed(i64::from(utc_offset_min));
    let (year, month, day) = civil_from_days(minutes / DAY_MIN);
    format!("Orasenda data {year:04}-{month:02}-{day:02}.db")
}

/// `data_export`: asks `pick` for a destination (given the default name), then writes a
/// consistent copy of the live data there. Works during a session. `None` from `pick` means the
/// panel was cancelled and nothing is written. `Unavailable` without a store, before any panel.
pub fn run_export<H: Host>(
    host: &H,
    pick: impl FnOnce(&str) -> Result<Option<PathBuf>, DataError>,
) -> Result<ExportOutcome, DataError> {
    let service = host.service().ok_or_else(run::no_store)?;
    let dir = run::dir_of(host)?;
    let now_ms = host.now_ms();
    let name = {
        let guard = lock(service);
        if guard.store().is_none() {
            return Err(run::no_store());
        }
        export_name(now_ms, guard.local_time().utc_offset_min(now_ms))
    };
    let Some(dest) = pick(&name)? else {
        return Ok(ExportOutcome::Cancelled);
    };
    if is_live_file(&dir, &dest) {
        return Err(DataError::new(
            DataErrorKind::Write,
            "choose a different file; this one is your open data",
        ));
    }
    {
        let guard = lock(service);
        let store = guard.store().ok_or_else(run::no_store)?;
        store.snapshot_to(&dest).map_err(|error| {
            eprintln!("data: could not export to {} ({error})", dest.display());
            DataError::new(DataErrorKind::Write, "Orasenda could not save the file")
        })?;
    }
    let file = dest
        .file_name()
        .map_or_else(|| name.clone(), |n| n.to_string_lossy().into_owned());
    Ok(ExportOutcome::Saved { file })
}

/// `data_import`: `Busy` before any panel opens, then asks `pick` for a file and merges it.
/// `None` from `pick` means cancelled and changes nothing. After a merge the OS shortcuts are
/// registered again, because the file may have carried other `keys.*` settings.
pub fn run_import_file<H: Host>(
    host: &H,
    keyboard: &KeyboardService,
    pick: impl FnOnce() -> Result<Option<PathBuf>, DataError>,
) -> Result<ImportOutcome, DataError> {
    if busy(host) {
        return Err(run::busy_error());
    }
    let dir = run::dir_of(host)?;
    let Some(source) = pick()? else {
        return Ok(ImportOutcome::Cancelled);
    };
    let report = run_import(host, &dir, &source)?;
    keyboard.register_saved(host);
    Ok(ImportOutcome::Imported { report })
}
