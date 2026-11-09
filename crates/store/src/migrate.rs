//! Forward-only schema migrations. `PRAGMA user_version` is the only schema version (ADR-012).

use rusqlite::Connection;

/// Every migration, in order. Each later sub-project appends `(N, include_str!(…000N_….sql))`.
const MIGRATIONS: &[(u32, &str)] = &[(1, include_str!("../migrations/0001_init.sql"))];

const _: () = assert!(
    MIGRATIONS[MIGRATIONS.len() - 1].0 == crate::SCHEMA_VERSION,
    "SCHEMA_VERSION must be the last migration's number"
);

/// Applies every migration after the file's `user_version`, each in its own transaction that
/// also sets `user_version`. The caller has already refused a newer file.
pub(crate) fn run(conn: &mut Connection) -> Result<(), rusqlite::Error> {
    let current: u32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    for (version, sql) in MIGRATIONS.iter().filter(|(version, _)| *version > current) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", version)?;
        tx.commit()?;
    }
    Ok(())
}
