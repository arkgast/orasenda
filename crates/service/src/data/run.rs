//! The data commands over any [`Host`]: the overview, backups, Restore, Delete all data and the
//! automatic backup. Restore and Delete all data stage a pending swap and ask the host to
//! restart; the swap lands at the next launch (spec 2026-11-12, sub-project G).

use std::path::PathBuf;

use orasenda_store::portability;

use super::{backups, pending, policy};
use crate::api::{
    BackupEntry, BackupKind, BackupPolicy, DataCounts, DataError, DataErrorKind, DataOverview,
    StoreStatus,
};
use crate::scheduler::Host;
use crate::session::lock;

/// True while a session exists, running or paused. Import, Restore and Delete all data refuse
/// while it does.
pub fn busy<H: Host>(host: &H) -> bool {
    host.service()
        .is_some_and(|service| lock(service).session_active(host.now_ms()))
}

pub(super) fn dir_of<H: Host>(host: &H) -> Result<PathBuf, DataError> {
    host.data_dir().ok_or_else(|| {
        DataError::new(
            DataErrorKind::Unavailable,
            "Orasenda can't find its data folder",
        )
    })
}

pub(super) fn no_store() -> DataError {
    DataError::new(
        DataErrorKind::Unavailable,
        "Orasenda can't open its data right now",
    )
}

pub(super) fn busy_error() -> DataError {
    DataError::new(DataErrorKind::Busy, "End the session first.")
}

/// `data_overview`: counts (none without a store), folder, backups, policy and their size.
pub fn run_overview<H: Host>(host: &H) -> DataOverview {
    let (counts, policy, store) = match host.service() {
        Some(service) => {
            let guard = lock(service);
            let counts = guard
                .store()
                .and_then(|store| match store.read(portability::counts) {
                    Ok(counts) => Some(DataCounts::from(counts)),
                    Err(error) => {
                        eprintln!("data: could not count the rows ({error})");
                        None
                    }
                });
            let policy = guard
                .store()
                .map_or_else(BackupPolicy::default, policy::read);
            (counts, policy, guard.store_status())
        }
        None => (None, BackupPolicy::default(), StoreStatus::Unavailable),
    };
    // Only the folder and the backup list depend on the data dir; the store's state does not.
    let dir = host.data_dir();
    let backups = dir.as_deref().map(backups::list).unwrap_or_default();
    DataOverview {
        counts,
        folder: dir.map_or_else(String::new, |dir| dir.to_string_lossy().into_owned()),
        total_bytes: backups.iter().map(|entry| entry.bytes).sum(),
        backups,
        policy,
        store,
    }
}

fn changed<H: Host>(host: &H) {
    host.emit_backups_changed(&run_overview(host));
}

/// `backups_create`: a `manual` backup. `Unavailable` without a store.
pub fn run_backups_create<H: Host>(host: &H) -> Result<BackupEntry, DataError> {
    let dir = dir_of(host)?;
    let service = host.service().ok_or_else(no_store)?;
    let entry = {
        let guard = lock(service);
        let store = guard.store().ok_or_else(no_store)?;
        backups::create(store, &dir, BackupKind::Manual, host.now_ms())?
    };
    changed(host);
    Ok(entry)
}

/// `backups_delete`: removes one listed backup.
pub fn run_backups_delete<H: Host>(host: &H, file: &str) -> Result<(), DataError> {
    backups::delete(&dir_of(host)?, file)?;
    changed(host);
    Ok(())
}

/// `backups_set_policy`: stores the policy and prunes at once. `Unavailable` without a store.
pub fn run_backups_set_policy<H: Host>(
    host: &H,
    policy: &BackupPolicy,
) -> Result<BackupPolicy, DataError> {
    let dir = dir_of(host)?;
    let service = host.service().ok_or_else(no_store)?;
    let stored = {
        let guard = lock(service);
        let store = guard.store().ok_or_else(no_store)?;
        policy::apply(store, &dir, policy, host.now_ms())?
    };
    changed(host);
    Ok(stored)
}

/// `backups_restore`: `Busy` during a session, else stage the backup, make the `before-restore`
/// backup (skipped without a store) and restart. A failed safety backup takes the staging back.
pub fn run_backups_restore<H: Host>(host: &H, file: &str) -> Result<(), DataError> {
    let dir = dir_of(host)?;
    let service = host.service().ok_or_else(no_store)?;
    let now_ms = host.now_ms();
    {
        // One lock from the Busy check to the backup: no session can start in between.
        let guard = lock(service);
        if guard.session_active(now_ms) {
            return Err(busy_error());
        }
        pending::stage_restore(&dir, file)?;
        if let Some(store) = guard.store()
            && let Err(error) = backups::create(store, &dir, BackupKind::BeforeRestore, now_ms)
        {
            pending::unstage_restore(&dir);
            return Err(error);
        }
    }
    changed(host);
    host.restart();
    Ok(())
}

/// `data_delete_all`: `Busy` during a session, else leave the delete marker and restart. Needs
/// no store. Backups are not touched.
pub fn run_data_delete_all<H: Host>(host: &H) -> Result<(), DataError> {
    let dir = dir_of(host)?;
    let service = host.service().ok_or_else(no_store)?;
    {
        let guard = lock(service);
        if guard.session_active(host.now_ms()) {
            return Err(busy_error());
        }
        pending::stage_delete(&dir)?;
    }
    host.restart();
    Ok(())
}

/// The automatic check: makes an `auto` backup when one is due and tells the webview. Nothing
/// without a store. True when it made one.
pub fn run_auto_check<H: Host>(host: &H) -> bool {
    let (Some(service), Some(dir)) = (host.service(), host.data_dir()) else {
        return false;
    };
    let now_ms = host.now_ms();
    let listed = backups::list(&dir);
    let created = {
        let guard = lock(service);
        let Some(store) = guard.store() else {
            return false;
        };
        backups::due(&listed, &policy::read(store), now_ms)
            && log_failure(backups::create(store, &dir, BackupKind::Auto, now_ms))
    };
    if created {
        changed(host);
    }
    created
}

fn log_failure(result: Result<BackupEntry, DataError>) -> bool {
    match result {
        Ok(_) => true,
        Err(error) => {
            eprintln!("backups: the automatic backup failed ({error})");
            false
        }
    }
}
