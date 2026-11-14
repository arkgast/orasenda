//! `task`: the file's row wins whole when its `updated_at` is later; a tombstone follows the
//! same rule. A rank outside `0-9A-Za-z` is replaced by one at the end of its lane.

use super::{Outcome, local_updated_at, opt};
use crate::portability::TaskRowAll;
use crate::{Entity, StoreError, Txn};
use serde_json::Value;

pub(super) fn merge_row(txn: &mut Txn, row: &TaskRowAll) -> Result<Outcome, StoreError> {
    let local = local_updated_at(txn, "task", "id", &row.id)?;
    if local.is_some_and(|at| row.updated_at <= at) {
        return Ok(Outcome::Kept);
    }
    let rank = if valid_rank(&row.rank) {
        row.rank.clone()
    } else {
        end_of_lane(txn, &row.lane, &row.id)?
    };
    txn.conn().execute(
        "INSERT OR REPLACE INTO task (id, title, notes, tags, kind, estimate, due, priority,
             checklist, lane, rank, frog_day, breakdown_dismissed, source_note_id, done_at,
             created_at, updated_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
        rusqlite::params![
            row.id,
            row.title,
            row.notes,
            row.tags,
            row.kind,
            row.estimate,
            row.due,
            row.priority,
            row.checklist,
            row.lane,
            rank,
            row.frog_day,
            row.breakdown_dismissed,
            row.source_note_id,
            row.done_at,
            row.created_at,
            row.updated_at,
            row.deleted_at,
        ],
    )?;
    let mut fields = vec![
        ("title", Value::from(row.title.clone())),
        ("notes", Value::from(row.notes.clone())),
        ("tags", json_text(&row.tags)?),
        ("kind", Value::from(row.kind.clone())),
        ("checklist", json_text(&row.checklist)?),
        ("lane", Value::from(row.lane.clone())),
        ("rank", Value::from(rank)),
        (
            "breakdown_dismissed",
            Value::from(row.breakdown_dismissed != 0),
        ),
        ("created_at", Value::from(row.created_at)),
    ];
    // An insert logs the columns a task has; a replacement also logs the ones it cleared.
    let optional = [
        ("estimate", opt(row.estimate)),
        ("due", opt(row.due.clone())),
        ("priority", opt(row.priority.clone())),
        ("frog_day", opt(row.frog_day.clone())),
        ("source_note_id", opt(row.source_note_id.clone())),
        ("done_at", opt(row.done_at)),
    ];
    fields.extend(
        optional
            .into_iter()
            .filter(|(_, v)| local.is_some() || !v.is_null()),
    );
    if row.deleted_at.is_some() || local.is_some() {
        fields.push(("deleted_at", opt(row.deleted_at)));
    }
    txn.log_fields(Entity::Task, &row.id, &fields)?;
    Ok(if local.is_some() {
        Outcome::Updated
    } else {
        Outcome::Added
    })
}

/// A stored JSON column, logged as the JSON value the repository logs.
fn json_text(text: &str) -> Result<Value, StoreError> {
    serde_json::from_str(text).map_err(|e| StoreError::Json(e.to_string()))
}

fn valid_rank(rank: &str) -> bool {
    !rank.is_empty() && rank.bytes().all(|b| b.is_ascii_alphanumeric())
}

/// A rank after every other task of `lane`, tombstones included, so it never ties one.
fn end_of_lane(txn: &Txn, lane: &str, id: &str) -> Result<String, StoreError> {
    let last: Option<String> = txn.conn().query_row(
        "SELECT max(rank) FROM task WHERE lane = ?1 AND id <> ?2",
        (lane, id),
        |r| r.get(0),
    )?;
    Ok(last.map_or_else(orasenda_core::rank::first, |last| {
        orasenda_core::rank::after(&last)
    }))
}
