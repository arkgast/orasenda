//! A read-only look at a database file, to tell Orasenda data from anything else.

use rusqlite::{Connection, ErrorCode, OpenFlags};
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
    let conn = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(map_error)?;
    let user_version: u32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(map_error)?;
    let has_meta: bool = conn
        .query_row(
            "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meta')",
            [],
            |row| row.get(0),
        )
        .map_err(map_error)?;
    let has_device_id = has_meta
        && conn
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM meta WHERE key = 'device_id')",
                [],
                |row| row.get(0),
            )
            .unwrap_or(false);
    Ok(Probe {
        user_version,
        has_device_id,
    })
}

fn map_error(err: rusqlite::Error) -> ProbeError {
    match err.sqlite_error_code() {
        Some(ErrorCode::NotADatabase) => ProbeError::NotSqlite,
        _ => ProbeError::Io(err.to_string()),
    }
}
