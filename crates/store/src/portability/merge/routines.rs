//! The routines tables (migration 0007): the file's row wins whole when it is later. For
//! `routine`, `habit` and `routine_run` "later" is `updated_at`; for `habit_check` it is
//! `checked_at`, which a removal also sets. A tie keeps the local row.
//!
//! A new row logs the fields its repository's insert logs, skipping the empty end and
//! tombstone columns; a replaced row logs every one, since any of them may have changed.

use super::{Outcome, local_updated_at, opt};
use crate::portability::{CheckRowAll, HabitRowAll, RoutineRowAll, RunRowAll};
use crate::{Entity, StoreError, Txn};
use rusqlite::OptionalExtension;
use rusqlite::types::Value as Sql;
use serde_json::Value;

/// One column: its name, the value written, and the value logged (`None`: never logged).
struct Column {
    name: &'static str,
    sql: Sql,
    log: Option<Value>,
}

fn col(name: &'static str, sql: impl Into<Sql>, log: Value) -> Column {
    Column {
        name,
        sql: sql.into(),
        log: Some(log),
    }
}

fn unlogged(name: &'static str, sql: impl Into<Sql>) -> Column {
    Column {
        name,
        sql: sql.into(),
        log: None,
    }
}

/// Columns logged on a replace only when they hold nothing: an insert never logs them empty.
const QUIET_WHEN_EMPTY: [&str; 3] = ["deleted_at", "ended_at", "outcome"];

/// Writes the row (`INSERT OR REPLACE`) when the file's `later` beats the local one, and logs
/// it. `table` and the column names are constants, never user text.
fn write_row(
    txn: &mut Txn,
    entity: Entity,
    id: &str,
    local: Option<i64>,
    later: i64,
    columns: Vec<Column>,
) -> Result<Outcome, StoreError> {
    if local.is_some_and(|at| later <= at) {
        return Ok(Outcome::Kept);
    }
    let names: Vec<&str> = columns.iter().map(|c| c.name).collect();
    let marks: Vec<String> = (1..=columns.len()).map(|i| format!("?{i}")).collect();
    txn.conn().execute(
        &format!(
            "INSERT OR REPLACE INTO {} (id, {}) VALUES (?{}, {})",
            entity.table(),
            names.join(", "),
            columns.len() + 1,
            marks.join(", ")
        ),
        rusqlite::params_from_iter(
            columns
                .iter()
                .map(|c| c.sql.clone())
                .chain([Sql::Text(id.to_owned())]),
        ),
    )?;
    let fields: Vec<(&'static str, Value)> = columns
        .into_iter()
        .filter_map(|c| c.log.map(|log| (c.name, log)))
        .filter(|(name, log)| {
            local.is_some() || !(log.is_null() && QUIET_WHEN_EMPTY.contains(name))
        })
        .collect();
    txn.log_fields(entity, id, &fields)?;
    Ok(if local.is_some() {
        Outcome::Updated
    } else {
        Outcome::Added
    })
}

/// A stored JSON list, logged as the list itself (as the repository logs it).
fn json_list(text: &str) -> Result<Value, StoreError> {
    Ok(serde_json::from_str(text)?)
}

pub(super) fn merge_routine(txn: &mut Txn, row: &RoutineRowAll) -> Result<Outcome, StoreError> {
    let local = local_updated_at(txn, "routine", "id", &row.id)?;
    let columns = vec![
        col("name", row.name.clone(), Value::from(row.name.clone())),
        col("time_of_day", row.time_of_day, opt(row.time_of_day)),
        col("days", row.days, Value::from(row.days)),
        col("template", row.template.clone(), opt(row.template.clone())),
        col("position", row.position, Value::from(row.position)),
        col("created_at", row.created_at, Value::from(row.created_at)),
        unlogged("updated_at", row.updated_at),
        col("deleted_at", row.deleted_at, opt(row.deleted_at)),
    ];
    write_row(
        txn,
        Entity::Routine,
        &row.id,
        local,
        row.updated_at,
        columns,
    )
}

pub(super) fn merge_habit(txn: &mut Txn, row: &HabitRowAll) -> Result<Outcome, StoreError> {
    let local = local_updated_at(txn, "habit", "id", &row.id)?;
    let text =
        |name: &'static str, value: &Option<String>| col(name, value.clone(), opt(value.clone()));
    let columns = vec![
        text("routine_id", &row.routine_id),
        col("position", row.position, Value::from(row.position)),
        col("name", row.name.clone(), Value::from(row.name.clone())),
        text("when_text", &row.when_text),
        text("where_text", &row.where_text),
        text("anchor", &row.anchor),
        text("two_minute", &row.two_minute),
        text("identity", &row.identity),
        col("optional", row.optional, Value::from(row.optional != 0)),
        col("days", row.days, opt(row.days)),
        col("created_at", row.created_at, Value::from(row.created_at)),
        unlogged("updated_at", row.updated_at),
        col("deleted_at", row.deleted_at, opt(row.deleted_at)),
    ];
    write_row(txn, Entity::Habit, &row.id, local, row.updated_at, columns)
}

pub(super) fn merge_check(txn: &mut Txn, row: &CheckRowAll) -> Result<Outcome, StoreError> {
    let local: Option<i64> = txn
        .conn()
        .query_row(
            "SELECT checked_at FROM habit_check WHERE id = ?1",
            [&row.id],
            |r| r.get(0),
        )
        .optional()?;
    let columns = vec![
        col(
            "habit_id",
            row.habit_id.clone(),
            Value::from(row.habit_id.clone()),
        ),
        col("day", row.day.clone(), Value::from(row.day.clone())),
        col("checked_at", row.checked_at, Value::from(row.checked_at)),
        col("deleted_at", row.deleted_at, opt(row.deleted_at)),
    ];
    write_row(
        txn,
        Entity::HabitCheck,
        &row.id,
        local,
        row.checked_at,
        columns,
    )
}

pub(super) fn merge_run(txn: &mut Txn, row: &RunRowAll) -> Result<Outcome, StoreError> {
    let local = local_updated_at(txn, "routine_run", "id", &row.id)?;
    let columns = vec![
        col(
            "routine_id",
            row.routine_id.clone(),
            Value::from(row.routine_id.clone()),
        ),
        col("day", row.day.clone(), Value::from(row.day.clone())),
        col("started_at", row.started_at, Value::from(row.started_at)),
        col("steps_total", row.steps_total, Value::from(row.steps_total)),
        col("steps_done", row.steps_done, Value::from(row.steps_done)),
        col(
            "steps_skipped",
            row.steps_skipped,
            Value::from(row.steps_skipped),
        ),
        col("step_ids", row.step_ids.clone(), json_list(&row.step_ids)?),
        col("answers", row.answers.clone(), json_list(&row.answers)?),
        col("ended_at", row.ended_at, opt(row.ended_at)),
        col("outcome", row.outcome.clone(), opt(row.outcome.clone())),
        unlogged("updated_at", row.updated_at),
    ];
    write_row(
        txn,
        Entity::RoutineRun,
        &row.id,
        local,
        row.updated_at,
        columns,
    )
}
