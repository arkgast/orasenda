//! Which tasks got focus time that counts: the buffer suggestion's per-task session counts.

use crate::{StoreError, Txn, sql_int};

/// Per task id in `ids`, how many live focus-phase rows linked to it ran at least
/// `min_focused_ms`. Breaks and tombstones do not count; a task with no such row is absent.
/// Ordered by task id.
pub fn counted_for_tasks(
    txn: &Txn,
    ids: &[String],
    min_focused_ms: u64,
) -> Result<Vec<(String, u32)>, StoreError> {
    let mut sorted: Vec<&String> = ids.iter().collect();
    sorted.sort();
    sorted.dedup();
    let mut stmt = txn.conn().prepare(
        "SELECT count(*) FROM focus_session
         WHERE task_id = ?1 AND phase = 'focus' AND deleted_at IS NULL AND focused_ms >= ?2",
    )?;
    let min = sql_int(min_focused_ms)?;
    let mut counted = Vec::new();
    for id in sorted {
        let n: i64 = stmt.query_row(rusqlite::params![id, min], |row| row.get(0))?;
        if n > 0 {
            let n = u32::try_from(n).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(0, n))?;
            counted.push((id.clone(), n));
        }
    }
    Ok(counted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Store;

    fn insert_raw(store: &Store, id: &str, task: &str, phase: &str, focused: i64, dead: bool) {
        store
            .write(1, |txn| {
                txn.conn().execute(
                    "INSERT INTO focus_session (id, preset, phase, planned_ms, started_at,
                         ended_at, paused_total_ms, focused_ms, end_reason, extensions,
                         created_at, updated_at, deleted_at, task_id)
                     VALUES (?1, 'quick', ?2, 1500000, 1000, 2000, 0, ?3, 'completed', 0,
                         2000, 2000, ?4, ?5)",
                    rusqlite::params![id, phase, focused, dead.then_some(3_000), task],
                )?;
                Ok(())
            })
            .expect("inserts");
    }

    fn ids(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| (*s).to_owned()).collect()
    }

    #[test]
    fn counted_skips_short_and_break_rows() {
        let store = Store::open_in_memory("device-a").expect("opens");
        insert_raw(&store, "s1", "t1", "focus", 600_000, false);
        insert_raw(&store, "s2", "t1", "focus", 599_999, false);
        insert_raw(&store, "s3", "t1", "break", 900_000, false);
        insert_raw(&store, "s4", "t1", "focus", 900_000, true);
        let counted = store
            .read(|txn| counted_for_tasks(txn, &ids(&["t1"]), 600_000))
            .expect("reads");
        assert_eq!(counted, [("t1".to_owned(), 1)]);
    }

    #[test]
    fn counted_groups_by_task() {
        let store = Store::open_in_memory("device-a").expect("opens");
        insert_raw(&store, "s1", "b", "focus", 700_000, false);
        insert_raw(&store, "s2", "a", "focus", 700_000, false);
        insert_raw(&store, "s3", "b", "focus", 800_000, false);
        insert_raw(&store, "s4", "other", "focus", 800_000, false);
        insert_raw(&store, "s5", "none", "focus", 100, false);
        let counted = store
            .read(|txn| counted_for_tasks(txn, &ids(&["b", "a", "none", "b"]), 600_000))
            .expect("reads");
        assert_eq!(counted, [("a".to_owned(), 1), ("b".to_owned(), 2)]);
        assert!(
            store
                .read(|txn| counted_for_tasks(txn, &[], 0))
                .expect("reads")
                .is_empty()
        );
    }
}
