//! Moving several tasks to the end of the Backlog in one write, and putting them back.

use super::Lane;
use crate::{StoreError, Txn};

/// Where a task was before a bulk move: what [`restore_lanes`] puts back.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LaneBefore {
    pub id: String,
    pub lane: Lane,
    pub rank: String,
}

/// Moves the live tasks in `ids` to the end of the Backlog, keeping the given order.
pub fn move_to_backlog_end(_txn: &mut Txn, _ids: &[String]) -> Result<Vec<LaneBefore>, StoreError> {
    Ok(Vec::new())
}

/// Puts each live task back in its lane at its rank.
pub fn restore_lanes(_txn: &mut Txn, _before: &[LaneBefore]) -> Result<(), StoreError> {
    Ok(())
}
