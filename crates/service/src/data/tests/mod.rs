//! Shared fixtures for the data tests: a temp app data dir and stores in it.

mod backups;
mod files;
mod import;
mod names;
mod pending;

use std::path::{Path, PathBuf};

use orasenda_store::{Store, meta};

pub(super) const T0: u64 = 1_793_000_000_000;
pub(super) const DAY: u64 = 86_400_000;

/// A fresh directory, removed on drop.
pub(super) struct TempDir(pub(super) PathBuf);

impl TempDir {
    pub(super) fn new() -> TempDir {
        let path = std::env::temp_dir().join(format!("orasenda-data-{}", uuid::Uuid::now_v7()));
        std::fs::create_dir_all(&path).expect("temp dir");
        TempDir(path)
    }

    pub(super) fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// A file-backed (WAL) store in `dir`.
pub(super) fn open(dir: &Path) -> Store {
    crate::session::open_store_at(dir, "device-a").expect("store opens")
}

pub(super) fn set_meta(store: &Store, key: &str, value: &str) {
    store
        .write(1, |txn| meta::set(txn, key, value))
        .expect("meta written");
}

pub(super) fn get_meta(store: &Store, key: &str) -> Option<String> {
    store.read(|txn| meta::get(txn, key)).expect("meta read")
}

/// Sets `PRAGMA user_version` in a file's header (bytes 60 to 63, big endian).
pub(super) fn set_user_version(path: &Path, version: u32) {
    let mut bytes = std::fs::read(path).expect("file reads");
    bytes[60..64].copy_from_slice(&version.to_be_bytes());
    std::fs::write(path, bytes).expect("file written");
}
