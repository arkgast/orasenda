//! Orphans: live tasks whose lane isn't a column on this board (a custom column removed or
//! lost on another device, then merged in). Each moves to the end of Backlog, logged like any
//! move (spec 2026-11-18, §Columns).

use orasenda_store::tasks;
use orasenda_store::{Store, StoreError, Txn};

use crate::api::ColumnSettings;

/// Moves every orphan to the end of Backlog, tasks of one lane together in rank order, in
/// the caller's transaction. Answers how many moved.
pub(crate) fn repair(txn: &mut Txn, columns: &[ColumnSettings]) -> Result<usize, StoreError> {
    let is_column = |lane: &tasks::Lane| columns.iter().any(|c| c.lane.as_str() == lane.as_str());
    if tasks::lanes_live(txn)?.iter().all(is_column) {
        return Ok(0);
    }
    // `list_live` is ordered by lane, then rank.
    let ids: Vec<String> = tasks::list_live(txn)?
        .into_iter()
        .filter(|task| !is_column(&task.lane))
        .map(|task| task.id)
        .collect();
    Ok(tasks::move_to_backlog_end(txn, &ids)?.len())
}

/// The repair at service start, before the first view, so it emits nothing. A failure is
/// logged and the start goes on; the next start or import tries again.
pub(crate) fn repair_at_start(store: &Store, now_ms: u64) {
    let result = store.write(now_ms, |txn| {
        let columns = super::columns::read(txn)?;
        repair(txn, &columns)
    });
    match result {
        Ok(0) => {}
        Ok(moved) => eprintln!("board: {moved} task(s) in a missing column moved to Backlog"),
        Err(error) => eprintln!("board: could not repair orphan tasks ({error})"),
    }
}
