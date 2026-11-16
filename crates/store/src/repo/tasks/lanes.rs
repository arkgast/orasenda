//! Moving several tasks to the end of the Backlog in one write, and putting them back.

use super::{Lane, get, last_backlog_rank, move_to};
use crate::{StoreError, Txn};
use orasenda_core::rank;

/// Where a task was before a bulk move: what [`restore_lanes`] puts back.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaneBefore {
    pub id: String,
    pub lane: Lane,
    pub rank: String,
}

/// Moves the live tasks in `ids` to the end of the Backlog, keeping the given order, in the
/// caller's one transaction. Removed and missing tasks are skipped. Returns where each moved
/// task was, in the given order. Every write logs like [`move_to`].
pub fn move_to_backlog_end(txn: &mut Txn, ids: &[String]) -> Result<Vec<LaneBefore>, StoreError> {
    let mut live = Vec::new();
    for id in ids {
        if let Some(row) = get(txn, id)?.filter(|row| row.deleted_at.is_none())
            && !live.iter().any(|b: &LaneBefore| b.id == row.id)
        {
            live.push(LaneBefore {
                id: row.id,
                lane: row.lane,
                rank: row.rank,
            });
        }
    }
    let last = last_backlog_rank(txn)?;
    let ranks = rank::spread(last.as_deref(), live.len());
    for (before, rank) in live.iter().zip(&ranks) {
        move_to(txn, &before.id, Lane::Backlog, rank)?;
    }
    Ok(live)
}

/// Puts each live task back in its lane at its rank. A removed or missing task is left alone.
pub fn restore_lanes(txn: &mut Txn, before: &[LaneBefore]) -> Result<(), StoreError> {
    for b in before {
        move_to(txn, &b.id, b.lane, &b.rank)?;
    }
    Ok(())
}
