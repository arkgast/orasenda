//! Every row of the four routines tables (migration 0007), tombstones and ended runs included.

use crate::StoreError;
use rusqlite::Connection;

/// A `routine` row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RoutineRowAll {
    pub id: String,
    pub name: String,
    pub time_of_day: Option<i64>,
    pub days: i64,
    pub template: Option<String>,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

/// A `habit` row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HabitRowAll {
    pub id: String,
    pub routine_id: Option<String>,
    pub position: i64,
    pub name: String,
    pub when_text: Option<String>,
    pub where_text: Option<String>,
    pub anchor: Option<String>,
    pub two_minute: Option<String>,
    pub identity: Option<String>,
    pub optional: i64,
    pub days: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

/// A `habit_check` row. `checked_at` is the time of its last change, a removal included.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CheckRowAll {
    pub id: String,
    pub habit_id: String,
    pub day: String,
    pub checked_at: i64,
    pub deleted_at: Option<i64>,
}

/// A `routine_run` row. `step_ids` and `answers` are the stored JSON text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunRowAll {
    pub id: String,
    pub routine_id: String,
    pub day: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub outcome: Option<String>,
    pub steps_total: i64,
    pub steps_done: i64,
    pub steps_skipped: i64,
    pub step_ids: String,
    pub answers: String,
    pub updated_at: i64,
}

/// The four tables' rows, ordered by id.
pub(super) type RoutineTables = (
    Vec<RoutineRowAll>,
    Vec<HabitRowAll>,
    Vec<CheckRowAll>,
    Vec<RunRowAll>,
);

pub(super) fn read(conn: &Connection) -> Result<RoutineTables, StoreError> {
    let routines = conn
        .prepare(
            "SELECT id, name, time_of_day, days, template, position, created_at, updated_at,
                 deleted_at
             FROM routine ORDER BY id",
        )?
        .query_map([], |row| {
            Ok(RoutineRowAll {
                id: row.get(0)?,
                name: row.get(1)?,
                time_of_day: row.get(2)?,
                days: row.get(3)?,
                template: row.get(4)?,
                position: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                deleted_at: row.get(8)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    let habits = conn
        .prepare(
            "SELECT id, routine_id, position, name, when_text, where_text, anchor, two_minute,
                 identity, optional, days, created_at, updated_at, deleted_at
             FROM habit ORDER BY id",
        )?
        .query_map([], |row| {
            Ok(HabitRowAll {
                id: row.get(0)?,
                routine_id: row.get(1)?,
                position: row.get(2)?,
                name: row.get(3)?,
                when_text: row.get(4)?,
                where_text: row.get(5)?,
                anchor: row.get(6)?,
                two_minute: row.get(7)?,
                identity: row.get(8)?,
                optional: row.get(9)?,
                days: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
                deleted_at: row.get(13)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    let checks = conn
        .prepare("SELECT id, habit_id, day, checked_at, deleted_at FROM habit_check ORDER BY id")?
        .query_map([], |row| {
            Ok(CheckRowAll {
                id: row.get(0)?,
                habit_id: row.get(1)?,
                day: row.get(2)?,
                checked_at: row.get(3)?,
                deleted_at: row.get(4)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    let runs = conn
        .prepare(
            "SELECT id, routine_id, day, started_at, ended_at, outcome, steps_total, steps_done,
                 steps_skipped, step_ids, answers, updated_at
             FROM routine_run ORDER BY id",
        )?
        .query_map([], |row| {
            Ok(RunRowAll {
                id: row.get(0)?,
                routine_id: row.get(1)?,
                day: row.get(2)?,
                started_at: row.get(3)?,
                ended_at: row.get(4)?,
                outcome: row.get(5)?,
                steps_total: row.get(6)?,
                steps_done: row.get(7)?,
                steps_skipped: row.get(8)?,
                step_ids: row.get(9)?,
                answers: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok((routines, habits, checks, runs))
}
