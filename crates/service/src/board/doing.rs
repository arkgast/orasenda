//! Starting a session on a task moves it to Doing, keeping Doing at its limit.

use orasenda_store::tasks::{self, Lane as Stored};
use orasenda_store::{StoreError, Txn};

use super::columns;
use super::service::{live, rank_at};
use crate::api::Lane;

/// Moves task `id` to the end of Doing. Only if Doing then holds more than its limit, the
/// task longest in Doing (first by rank, since tasks join at the end) goes to the top of
/// Today; its title is answered. A task already in Doing doesn't move.
pub(crate) fn move_to_doing(txn: &mut Txn, id: &str) -> Result<Option<String>, StoreError> {
    let Some(task) = live(txn, id)? else {
        return Ok(None);
    };
    if task.lane == Stored::Doing {
        return Ok(None);
    }
    let rank = rank_at(txn, Lane::Doing, usize::MAX, Some(id))?;
    tasks::move_to(txn, id, Stored::Doing, &rank)?;
    let limit = columns::read(txn)?
        .into_iter()
        .find(|c| c.lane == Lane::Doing)
        .and_then(|c| c.limit);
    let doing: Vec<_> = tasks::list_live(txn)?
        .into_iter()
        .filter(|t| t.lane == Stored::Doing)
        .collect();
    if !limit.is_some_and(|l| doing.len() > usize::from(l)) {
        return Ok(None);
    }
    let Some(longest) = doing.iter().find(|t| t.id != id) else {
        return Ok(None);
    };
    let top = rank_at(txn, Lane::Today, 0, None)?;
    tasks::move_to(txn, &longest.id, Stored::Today, &top)?;
    Ok(Some(longest.title.clone()))
}
