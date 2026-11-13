//! A read-only look at a database file, to tell Orasenda data from anything else.

use std::path::Path;

/// What a file says about itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Probe {
    pub user_version: u32,
    pub has_device_id: bool,
}

/// Why a file could not be probed.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProbeError {
    /// SQLite cannot read the file as a database.
    NotSqlite,
    /// The file could not be opened (missing, permission denied) or read.
    Io(String),
}

impl std::fmt::Display for ProbeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProbeError::NotSqlite => f.write_str("the file is not an SQLite database"),
            ProbeError::Io(message) => write!(f, "cannot read the file: {message}"),
        }
    }
}

impl std::error::Error for ProbeError {}

/// Opens `path` read-only and reads `user_version` and whether `meta.device_id` exists.
/// Never writes to the file.
pub fn probe(path: &Path) -> Result<Probe, ProbeError> {
    let _ = path;
    todo!()
}
