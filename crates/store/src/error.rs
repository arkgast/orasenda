//! The two error types the store returns.

use rusqlite::ErrorCode;

/// Why a store could not be opened.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OpenError {
    /// The file was written by a newer Orasenda. It is left untouched.
    Newer { found: u32, supported: u32 },
    /// SQLite refused the file or its contents are inconsistent.
    Sqlite(String),
    /// The file could not be opened or created (missing directory, permission denied).
    Io(String),
}

impl std::fmt::Display for OpenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OpenError::Newer { found, supported } => write!(
                f,
                "database schema version {found} is newer than this build supports ({supported})"
            ),
            OpenError::Sqlite(message) => write!(f, "database error: {message}"),
            OpenError::Io(message) => write!(f, "cannot open database file: {message}"),
        }
    }
}

impl std::error::Error for OpenError {}

impl From<rusqlite::Error> for OpenError {
    fn from(err: rusqlite::Error) -> OpenError {
        match err.sqlite_error_code() {
            Some(ErrorCode::CannotOpen | ErrorCode::PermissionDenied) => {
                OpenError::Io(err.to_string())
            }
            _ => OpenError::Sqlite(err.to_string()),
        }
    }
}

/// Why a read or write failed. A failed write has been rolled back.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StoreError {
    Sqlite(String),
    /// A value did not serialize, or a stored value did not deserialize into the asked type.
    Json(String),
    /// The store can no longer be used.
    Closed,
}

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StoreError::Sqlite(message) => write!(f, "database error: {message}"),
            StoreError::Json(message) => write!(f, "stored value error: {message}"),
            StoreError::Closed => f.write_str("the store is closed"),
        }
    }
}

impl std::error::Error for StoreError {}

impl From<rusqlite::Error> for StoreError {
    fn from(err: rusqlite::Error) -> StoreError {
        StoreError::Sqlite(err.to_string())
    }
}

impl From<serde_json::Error> for StoreError {
    fn from(err: serde_json::Error) -> StoreError {
        StoreError::Json(err.to_string())
    }
}
