//! Shared fixtures for the portability tests.

mod probe;
mod snapshot;
mod stats;

use crate::Store;
use crate::migrate::MIGRATIONS;
use rusqlite::Connection;
use std::path::Path;

pub(super) const DEVICE: &str = "device-a";

/// A file at schema `version`: only the first `version` migrations ran, as an old build left it.
pub(super) fn file_at_version(path: &Path, version: u32) {
    let conn = Connection::open(path).expect("fixture opens");
    for (number, sql) in MIGRATIONS.iter().filter(|(number, _)| *number <= version) {
        conn.execute_batch(sql).expect("migration runs");
        conn.pragma_update(None, "user_version", number)
            .expect("version set");
    }
    if version > 0 {
        conn.execute(
            "INSERT INTO meta (key, value) VALUES ('device_id', 'old-device')",
            [],
        )
        .expect("device id written");
    }
}

/// Raw SQL through the store's connection, outside a transaction.
pub(super) fn exec(store: &Store, sql: &str) {
    store
        .with_conn(|conn| Ok(conn.execute_batch(sql)?))
        .expect("sql runs");
}

pub(super) fn rows(conn: &Connection, table: &str) -> Vec<Vec<String>> {
    let mut stmt = conn
        .prepare(&format!("SELECT * FROM {table} ORDER BY 1, 2"))
        .expect("prepares");
    let width = stmt.column_count();
    stmt.query_map([], |row| {
        (0..width)
            .map(|i| row.get::<_, rusqlite::types::Value>(i).map(|v| format!("{v:?}")))
            .collect()
    })
    .expect("runs")
    .collect::<Result<_, _>>()
    .expect("reads")
}
