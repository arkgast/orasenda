//! The data-portability types the webview sees: backups, their policy and the errors (spec
//! 2026-11-12, sub-project G).

use orasenda_store::portability::Counts;
use serde::{Deserialize, Serialize};

/// Why a backup was made. It is part of the file name.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum BackupKind {
    Auto,
    Manual,
    BeforeImport,
    BeforeRestore,
}

/// One backup file. Time and kind come from the name, the size from the file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub file: String,
    pub kind: BackupKind,
    /// UTC milliseconds since the Unix epoch. Exported as `number`: lossless below 2^53.
    #[specta(type = specta_typescript::Number)]
    pub created_ms: u64,
    #[specta(type = specta_typescript::Number)]
    pub bytes: u64,
    /// Saved by a newer Orasenda: listed, but it can't be restored here.
    pub newer: bool,
}

/// How often the automatic backup is due.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum BackupFrequency {
    Monthly,
    Quarterly,
}

/// The backup settings, device-only (`meta`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BackupPolicy {
    pub frequency: BackupFrequency,
    /// How many backups to keep, 1 to 50, across every kind.
    pub keep: u32,
}

impl Default for BackupPolicy {
    fn default() -> Self {
        BackupPolicy {
            frequency: BackupFrequency::Monthly,
            keep: 12,
        }
    }
}

/// How many live rows each syncable table holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DataCounts {
    pub sessions: u32,
    pub presets: u32,
    pub notes: u32,
    pub settings: u32,
}

impl From<Counts> for DataCounts {
    fn from(counts: Counts) -> Self {
        DataCounts {
            sessions: counts.sessions,
            presets: counts.presets,
            notes: counts.notes,
            settings: counts.settings,
        }
    }
}

/// What went wrong, for the line the webview shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum DataErrorKind {
    Busy,
    Newer,
    NotOrasenda,
    Unreadable,
    Write,
    Unavailable,
    NotFound,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub struct DataError {
    pub kind: DataErrorKind,
    pub message: String,
}

impl DataError {
    pub fn new(kind: DataErrorKind, message: impl Into<String>) -> Self {
        DataError {
            kind,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for DataError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for DataError {}

/// Everything the Settings data sections show, and the payload of `backups-changed`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DataOverview {
    /// `None` while the store is unavailable.
    pub counts: Option<DataCounts>,
    /// The app data folder.
    pub folder: String,
    pub backups: Vec<BackupEntry>,
    pub policy: BackupPolicy,
    /// The size of every listed backup together.
    #[specta(type = specta_typescript::Number)]
    pub total_bytes: u64,
    pub store: super::StoreStatus,
}

impl DataOverview {
    /// What the webview shows when the overview could not be built at all.
    pub fn unavailable() -> DataOverview {
        DataOverview {
            counts: None,
            folder: String::new(),
            backups: Vec::new(),
            policy: BackupPolicy::default(),
            total_bytes: 0,
            store: super::StoreStatus::Unavailable,
        }
    }
}
