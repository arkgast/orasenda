//! A bare SQLite connection to a data file, for the service tests' fixtures (old schema
//! versions, a commit still in the `-wal`, counting `change_log` rows). Behind `test-hooks`.

use std::path::Path;

/// One connection to `path`, outside any [`crate::Store`].
pub struct RawDb(rusqlite::Connection);

impl RawDb {
    pub fn open(path: &Path) -> RawDb {
        RawDb(rusqlite::Connection::open(path).expect("raw connection opens"))
    }

    /// Runs one or more statements.
    pub fn exec(&self, sql: &str) {
        self.0.execute_batch(sql).expect("sql runs");
    }

    /// The first column of the first row of `sql`.
    pub fn count(&self, sql: &str) -> i64 {
        self.0
            .query_row(sql, [], |row| row.get(0))
            .expect("sql counts")
    }
}
