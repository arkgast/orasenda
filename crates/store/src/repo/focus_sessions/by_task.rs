//! Where focus time went: per task, over a range of start times.

use crate::{StoreError, Txn, sql_int};

/// Per task, the focused milliseconds of live focus-phase rows linked to it that started in
/// `from_ms..to_ms`, most focus first (ties by task id). Rows with no task are left out.
pub fn focused_by_task(
    txn: &Txn,
    from_ms: u64,
    to_ms: u64,
) -> Result<Vec<(String, u64)>, StoreError> {
    let mut stmt = txn.conn().prepare(
        "SELECT task_id, SUM(focused_ms) AS total FROM focus_session
         WHERE phase = 'focus' AND deleted_at IS NULL AND task_id IS NOT NULL
           AND started_at >= ?1 AND started_at < ?2
         GROUP BY task_id ORDER BY total DESC, task_id",
    )?;
    let rows = stmt.query_map((sql_int(from_ms)?, sql_int(to_ms)?), |row| {
        let total: i64 = row.get(1)?;
        let total =
            u64::try_from(total).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(1, total))?;
        Ok((row.get::<_, String>(0)?, total))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Store;

    fn insert_raw(store: &Store, id: &str, task: Option<&str>, started: i64, focused: i64) {
        store
            .write(1, |txn| {
                txn.conn().execute(
                    "INSERT INTO focus_session (id, preset, phase, planned_ms, started_at,
                         ended_at, paused_total_ms, focused_ms, end_reason, extensions,
                         created_at, updated_at, task_id)
                     VALUES (?1, 'quick', 'focus', 1500000, ?2, ?2, 0, ?3, 'completed', 0,
                         ?2, ?2, ?4)",
                    rusqlite::params![id, started, focused, task],
                )?;
                Ok(())
            })
            .expect("inserts");
    }

    #[test]
    fn sums_per_task_in_range_most_first() {
        let store = Store::open_in_memory("device-a").expect("opens");
        insert_raw(&store, "s1", Some("a"), 1_000, 100);
        insert_raw(&store, "s2", Some("b"), 1_500, 300);
        insert_raw(&store, "s3", Some("a"), 1_900, 100);
        insert_raw(&store, "s4", Some("a"), 2_000, 900);
        insert_raw(&store, "s5", None, 1_000, 900);
        insert_raw(&store, "s6", Some("a"), 1_300, 500);
        insert_raw(&store, "s7", Some("a"), 1_400, 500);
        store
            .write(1, |txn| {
                txn.conn().execute(
                    "UPDATE focus_session SET phase = 'short_break' WHERE id = 's6'",
                    [],
                )?;
                txn.conn().execute(
                    "UPDATE focus_session SET deleted_at = 1 WHERE id = 's7'",
                    [],
                )?;
                Ok(())
            })
            .expect("updates");
        let found = store
            .read(|txn| focused_by_task(txn, 1_000, 2_000))
            .expect("reads");
        assert_eq!(found, [("b".to_owned(), 300), ("a".to_owned(), 200)]);
    }
}
