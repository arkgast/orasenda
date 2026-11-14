//! Field-wise task writes: [`update`], [`move_to`] and [`set_frog`]. Each logs one
//! `change_log` row per changed field and nothing when nothing changed.

use super::{ChecklistItem, Lane, Priority, TaskKind, TaskRow, get};
use crate::{Entity, StoreError, Txn, sql_int};
use rusqlite::types::Value as Sql;
use serde_json::Value;

/// The fields to change. `None` leaves a field alone; for a nullable field `Some(None)`
/// clears it. A field set to the value it already has is not a change.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TaskPatch {
    pub title: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<Vec<String>>,
    pub kind: Option<TaskKind>,
    pub estimate: Option<Option<u8>>,
    pub due: Option<Option<String>>,
    pub priority: Option<Option<Priority>>,
    pub checklist: Option<Vec<ChecklistItem>>,
    pub breakdown_dismissed: Option<bool>,
}

/// The changed fields of one write: column, SQL value, logged JSON value.
#[derive(Default)]
struct Changes(Vec<(&'static str, Sql, Value)>);

impl Changes {
    fn push(&mut self, column: &'static str, sql: Sql, logged: Value) {
        self.0.push((column, sql, logged));
    }

    fn text(&mut self, column: &'static str, new: &str, old: &str) {
        if new != old {
            self.push(column, Sql::Text(new.to_owned()), Value::from(new));
        }
    }

    fn opt_text(&mut self, column: &'static str, new: &Option<String>, old: &Option<String>) {
        if new != old {
            let (sql, logged) = match new {
                Some(text) => (Sql::Text(text.clone()), Value::from(text.clone())),
                None => (Sql::Null, Value::Null),
            };
            self.push(column, sql, logged);
        }
    }

    /// Applies the changes to `id`, stamping `updated_at`, and logs them. Returns whether
    /// there was anything to write.
    fn write(self, txn: &mut Txn, id: &str) -> Result<bool, StoreError> {
        if self.0.is_empty() {
            return Ok(false);
        }
        let mut sets: Vec<String> = Vec::new();
        let mut params: Vec<Sql> = vec![Sql::Text(id.to_owned())];
        for (column, sql, _) in &self.0 {
            params.push(sql.clone());
            sets.push(format!("{column} = ?{}", params.len()));
        }
        params.push(Sql::Integer(sql_int(txn.now_ms())?));
        sets.push(format!("updated_at = ?{}", params.len()));
        txn.conn().execute(
            &format!("UPDATE task SET {} WHERE id = ?1", sets.join(", ")),
            rusqlite::params_from_iter(params),
        )?;
        let fields: Vec<(&'static str, Value)> = self
            .0
            .into_iter()
            .map(|(column, _, logged)| (column, logged))
            .collect();
        txn.log_fields(Entity::Task, id, &fields)?;
        Ok(true)
    }
}

fn live(txn: &Txn, id: &str) -> Result<Option<TaskRow>, StoreError> {
    Ok(get(txn, id)?.filter(|row| row.deleted_at.is_none()))
}

/// Applies `patch` to a live task. Returns whether anything changed: a missing or removed
/// task, or a patch that matches the stored values, writes nothing.
pub fn update(txn: &mut Txn, id: &str, patch: &TaskPatch) -> Result<bool, StoreError> {
    let Some(old) = live(txn, id)? else {
        return Ok(false);
    };
    let mut changes = Changes::default();
    if let Some(title) = &patch.title {
        changes.text("title", title, &old.title);
    }
    if let Some(notes) = &patch.notes {
        changes.text("notes", notes, &old.notes);
    }
    if let Some(tags) = patch.tags.as_ref().filter(|tags| **tags != old.tags) {
        changes.push(
            "tags",
            Sql::Text(serde_json::to_string(tags)?),
            serde_json::to_value(tags)?,
        );
    }
    if let Some(kind) = patch.kind.filter(|kind| *kind != old.kind) {
        changes.push(
            "kind",
            Sql::Text(kind.as_str().to_owned()),
            Value::from(kind.as_str()),
        );
    }
    if let Some(estimate) = patch.estimate.filter(|estimate| *estimate != old.estimate) {
        let (sql, logged) = estimate.map_or((Sql::Null, Value::Null), |n| {
            (Sql::Integer(i64::from(n)), Value::from(n))
        });
        changes.push("estimate", sql, logged);
    }
    if let Some(due) = &patch.due {
        changes.opt_text("due", due, &old.due);
    }
    if let Some(priority) = patch.priority.filter(|priority| *priority != old.priority) {
        let (sql, logged) = priority.map_or((Sql::Null, Value::Null), |p| {
            (Sql::Text(p.as_str().to_owned()), Value::from(p.as_str()))
        });
        changes.push("priority", sql, logged);
    }
    if let Some(list) = patch
        .checklist
        .as_ref()
        .filter(|list| **list != old.checklist)
    {
        changes.push(
            "checklist",
            Sql::Text(serde_json::to_string(list)?),
            serde_json::to_value(list)?,
        );
    }
    if let Some(flag) = patch
        .breakdown_dismissed
        .filter(|f| *f != old.breakdown_dismissed)
    {
        changes.push(
            "breakdown_dismissed",
            Sql::Integer(i64::from(flag)),
            Value::from(flag),
        );
    }
    changes.write(txn, id)
}

/// Moves a live task to `lane` at `rank`. Entering Done sets `done_at` to the write time;
/// reordering inside Done keeps it; leaving Done clears it. Returns whether anything changed.
pub fn move_to(txn: &mut Txn, id: &str, lane: Lane, rank: &str) -> Result<bool, StoreError> {
    let Some(old) = live(txn, id)? else {
        return Ok(false);
    };
    let mut changes = Changes::default();
    if lane != old.lane {
        changes.push(
            "lane",
            Sql::Text(lane.as_str().to_owned()),
            Value::from(lane.as_str()),
        );
    }
    changes.text("rank", rank, &old.rank);
    if lane == Lane::Done && old.done_at.is_none() {
        let now = txn.now_ms();
        changes.push("done_at", Sql::Integer(sql_int(now)?), Value::from(now));
    } else if lane != Lane::Done && old.done_at.is_some() {
        changes.push("done_at", Sql::Null, Value::Null);
    }
    changes.write(txn, id)
}

/// Makes a live task the Frog of `day` (`YYYY-MM-DD`) and, in the same transaction, clears the
/// flag from any other live task for that day. Returns the id of the Frog it replaced, or
/// `None` when there was none (or the task already was the Frog). A missing or removed task
/// is an error and writes nothing.
pub fn set_frog(txn: &mut Txn, id: &str, day: &str) -> Result<Option<String>, StoreError> {
    let Some(old) = live(txn, id)? else {
        return Err(StoreError::Sqlite(format!("no live task {id}")));
    };
    let previous: Option<String> = txn
        .conn()
        .prepare("SELECT id FROM task WHERE frog_day = ?1 AND id != ?2 AND deleted_at IS NULL ORDER BY updated_at DESC, id LIMIT 1")?
        .query_map([day, id], |row| row.get(0))?
        .next()
        .transpose()?;
    let others: Vec<String> = txn
        .conn()
        .prepare("SELECT id FROM task WHERE frog_day = ?1 AND id != ?2 AND deleted_at IS NULL")?
        .query_map([day, id], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    for other in &others {
        let mut cleared = Changes::default();
        cleared.push("frog_day", Sql::Null, Value::Null);
        cleared.write(txn, other)?;
    }
    let mut changes = Changes::default();
    changes.opt_text("frog_day", &Some(day.to_owned()), &old.frog_day);
    changes.write(txn, id)?;
    Ok(previous)
}
