//! Forward-only schema migrations. `PRAGMA user_version` is the only schema version (ADR-012).

use rusqlite::Connection;

/// The preset library migration. Named once so a renumbering at landing touches only this file.
pub(crate) const PRESET_LIBRARY_SQL: &str = include_str!("../migrations/0003_preset_library.sql");

/// Every migration, in order. Each later sub-project appends `(N, include_str!(…000N_….sql))`.
pub(crate) const MIGRATIONS: &[(u32, &str)] = &[
    (1, include_str!("../migrations/0001_init.sql")),
    (2, include_str!("../migrations/0002_notify_review.sql")),
    (3, PRESET_LIBRARY_SQL),
    (4, include_str!("../migrations/0004_window_frame.sql")),
    (5, include_str!("../migrations/0005_inbox_note.sql")),
    (6, include_str!("../migrations/0006_drop_intent.sql")),
];

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
