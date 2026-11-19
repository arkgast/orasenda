//! Board tasks. **Syncable**: every write logs to `change_log` with `entity = "task"` and
//! `entity_id` = the task id, one row per changed field (ADR-002, ADR-012). A removed task is a
//! tombstone (`deleted_at`), never a deleted row, so Undo can bring it back. Trimming, the tag
//! and checklist rules and the lane limits are the service's; the CHECKs in the table are the
//! last line.
//!
//! Tracked time is **derived**, never stored: [`tracked`] sums `focus_session` rows that carry
//! the task's id.

mod lanes;
mod update;

pub use lanes::{LaneBefore, move_to_backlog_end, restore_lanes};
pub use update::{TaskPatch, clear_frog, move_to, set_frog, update};

use std::borrow::Cow;

use crate::{Entity, StoreError, Txn, sql_int};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// A board column's id. Named `lane` in SQL, beside `ADD COLUMN`. One of the four built-ins
/// (`backlog`, `today`, `doing`, `done`) or a custom id: `c_` and 8 characters of `[0-9a-z]`.
/// Whether a lane exists on this board is the service's check, not this type's.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Lane(Cow<'static, str>);

/// The four built-in columns, for `match` on [`Lane::builtin`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Builtin {
    Backlog,
    Today,
    Doing,
    Done,
}

impl Lane {
    pub const BACKLOG: Lane = Lane(Cow::Borrowed("backlog"));
    pub const TODAY: Lane = Lane(Cow::Borrowed("today"));
    pub const DOING: Lane = Lane(Cow::Borrowed("doing"));
    pub const DONE: Lane = Lane(Cow::Borrowed("done"));

    /// A built-in, or `c_` followed by 8 of `[0-9a-z]`; anything else is `None`.
    pub fn parse(text: &str) -> Option<Lane> {
        match text {
            "backlog" => Some(Lane::BACKLOG),
            "today" => Some(Lane::TODAY),
            "doing" => Some(Lane::DOING),
            "done" => Some(Lane::DONE),
            _ => {
                let id = text.strip_prefix("c_")?;
                let ok = id.len() == 8
                    && id
                        .bytes()
                        .all(|b| b.is_ascii_digit() || b.is_ascii_lowercase());
                ok.then(|| Lane(Cow::Owned(text.to_owned())))
            }
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    /// Which built-in this is, or `None` for a custom column.
    pub fn builtin(&self) -> Option<Builtin> {
        match self.as_str() {
            "backlog" => Some(Builtin::Backlog),
            "today" => Some(Builtin::Today),
            "doing" => Some(Builtin::Doing),
            "done" => Some(Builtin::Done),
            _ => None,
        }
    }
}

impl From<Builtin> for Lane {
    fn from(builtin: Builtin) -> Lane {
        match builtin {
            Builtin::Backlog => Lane::BACKLOG,
            Builtin::Today => Lane::TODAY,
            Builtin::Doing => Lane::DOING,
            Builtin::Done => Lane::DONE,
        }
    }
}

/// Whether a task needs deep focus or is light work.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskKind {
    Deep,
    Shallow,
}

/// How much a task matters; a task may have none.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Priority {
    High,
    Medium,
    Low,
}

macro_rules! text_enum {
    ($ty:ident { $($variant:ident => $text:literal),+ }) => {
        impl $ty {
            pub(crate) fn as_str(self) -> &'static str {
                match self { $($ty::$variant => $text),+ }
            }

            pub(crate) fn parse(text: &str) -> Option<$ty> {
                match text { $($text => Some($ty::$variant),)+ _ => None }
            }
        }
    };
}

text_enum!(TaskKind { Deep => "deep", Shallow => "shallow" });
text_enum!(Priority { High => "high", Medium => "medium", Low => "low" });

/// One checklist line of a task.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChecklistItem {
    pub id: String,
    pub text: String,
    pub done: bool,
}

/// A task to insert. `id` is a UUIDv7 made by the caller. A new task is never removed, never
/// done (`done_at` is set by [`move_to`]) and has not dismissed the breakdown prompt.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewTask {
    pub id: String,
    pub title: String,
    pub notes: String,
    pub tags: Vec<String>,
    pub kind: TaskKind,
    pub estimate: Option<u8>,
    pub due: Option<String>,
    pub priority: Option<Priority>,
    pub checklist: Vec<ChecklistItem>,
    pub lane: Lane,
    pub rank: String,
    pub frog_day: Option<String>,
    pub source_note_id: Option<String>,
    /// Where an imported task came from, `<source>:<key>`; set once at insert.
    pub origin: Option<String>,
    pub created_at: u64,
}

/// A stored task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskRow {
    pub id: String,
    pub title: String,
    pub notes: String,
    pub tags: Vec<String>,
    pub kind: TaskKind,
    pub estimate: Option<u8>,
    pub due: Option<String>,
    pub priority: Option<Priority>,
    pub checklist: Vec<ChecklistItem>,
    pub lane: Lane,
    pub rank: String,
    pub frog_day: Option<String>,
    pub breakdown_dismissed: bool,
    pub source_note_id: Option<String>,
    pub origin: Option<String>,
    pub done_at: Option<u64>,
    pub created_at: u64,
    pub updated_at: u64,
    pub deleted_at: Option<u64>,
}

/// What one task has had tracked: the sum of `focused_ms` over its focus rows and how many
/// there are.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Tracked {
    pub task_id: String,
    pub focused_ms: u64,
    pub sessions: u32,
}

const COLUMNS: &str = "id, title, notes, tags, kind, estimate, due, priority, checklist, lane,
    rank, frog_day, breakdown_dismissed, source_note_id, done_at, created_at, updated_at,
    deleted_at, origin";

/// Inserts a live task in the given lane and logs every field. `updated_at` is the write time.
/// A task inserted straight into `Done` gets `done_at` = the write time (and it is logged).
/// A value the CHECKs refuse, or a repeated id, fails and writes nothing.
pub fn insert(txn: &mut Txn, task: &NewTask) -> Result<(), StoreError> {
    let tags = serde_json::to_string(&task.tags)?;
    let checklist = serde_json::to_string(&task.checklist)?;
    let now = txn.now_ms();
    let done_at = (task.lane == Lane::DONE).then_some(now);
    txn.conn().execute(
        "INSERT INTO task (id, title, notes, tags, kind, estimate, due, priority, checklist,
             lane, rank, frog_day, breakdown_dismissed, source_note_id, done_at, created_at,
             updated_at, deleted_at, origin)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 0, ?13, ?16, ?14, ?15, NULL, ?17)",
        rusqlite::params![
            task.id,
            task.title,
            task.notes,
            tags,
            task.kind.as_str(),
            task.estimate,
            task.due,
            task.priority.map(Priority::as_str),
            checklist,
            task.lane.as_str(),
            task.rank,
            task.frog_day,
            task.source_note_id,
            sql_int(task.created_at)?,
            sql_int(now)?,
            done_at.map(sql_int).transpose()?,
            task.origin,
        ],
    )?;
    let mut fields = vec![
        ("title", Value::from(task.title.clone())),
        ("notes", Value::from(task.notes.clone())),
        ("tags", serde_json::to_value(&task.tags)?),
        ("kind", Value::from(task.kind.as_str())),
        ("estimate", task.estimate.map_or(Value::Null, Value::from)),
        ("due", task.due.clone().map_or(Value::Null, Value::from)),
        (
            "priority",
            task.priority
                .map_or(Value::Null, |p| Value::from(p.as_str())),
        ),
        ("checklist", serde_json::to_value(&task.checklist)?),
        ("lane", Value::from(task.lane.as_str())),
        ("rank", Value::from(task.rank.clone())),
        (
            "frog_day",
            task.frog_day.clone().map_or(Value::Null, Value::from),
        ),
        ("breakdown_dismissed", Value::from(false)),
        (
            "source_note_id",
            task.source_note_id.clone().map_or(Value::Null, Value::from),
        ),
        ("created_at", Value::from(task.created_at)),
    ];
    if let Some(done_at) = done_at {
        fields.push(("done_at", Value::from(done_at)));
    }
    if let Some(origin) = &task.origin {
        fields.push(("origin", Value::from(origin.clone())));
    }
    txn.log_fields(Entity::Task, &task.id, &fields)
}

/// One task by id, removed or not, or `None` when there is no such row.
pub fn get(txn: &Txn, id: &str) -> Result<Option<TaskRow>, StoreError> {
    let mut stmt = txn
        .conn()
        .prepare(&format!("SELECT {COLUMNS} FROM task WHERE id = ?1"))?;
    let mut rows = stmt.query_map([id], read_row)?;
    Ok(rows.next().transpose()?)
}

/// Every live task, grouped by lane name then in rank order (equal ranks by id). The service
/// puts the lanes in board order.
pub fn list_live(txn: &Txn) -> Result<Vec<TaskRow>, StoreError> {
    let mut stmt = txn.conn().prepare(&format!(
        "SELECT {COLUMNS} FROM task WHERE deleted_at IS NULL ORDER BY lane, rank, id"
    ))?;
    let rows = stmt.query_map([], read_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// The live Done tasks finished at or after `since_ms`, newest first.
pub fn list_done_since(txn: &Txn, since_ms: u64) -> Result<Vec<TaskRow>, StoreError> {
    let mut stmt = txn.conn().prepare(&format!(
        "SELECT {COLUMNS} FROM task
         WHERE deleted_at IS NULL AND lane = 'done' AND done_at >= ?1
         ORDER BY done_at DESC, id DESC"
    ))?;
    let rows = stmt.query_map([sql_int(since_ms)?], read_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Every task holding one of `asked`, as `(origin, lane, live)`: removed tasks (`live` false)
/// and Done tasks of any age included. Ordered by origin, then board lane order, then id. An
/// origin nobody holds is absent.
pub fn origins(txn: &Txn, asked: &[String]) -> Result<Vec<(String, Lane, bool)>, StoreError> {
    let mut stmt = txn.conn().prepare(
        "SELECT lane, deleted_at IS NULL FROM task WHERE origin = ?1
         ORDER BY CASE lane WHEN 'backlog' THEN 0 WHEN 'today' THEN 1 WHEN 'doing' THEN 2
                  WHEN 'done' THEN 4 ELSE 3 END, id",
    )?;
    let mut found = Vec::new();
    let mut sorted: Vec<&String> = asked.iter().collect();
    sorted.sort();
    sorted.dedup();
    for origin in sorted {
        let rows = stmt.query_map([origin], |row| {
            Ok((parsed(row, 0, Lane::parse)?, row.get::<_, bool>(1)?))
        })?;
        for row in rows {
            let (lane, live) = row?;
            found.push((origin.clone(), lane, live));
        }
    }
    Ok(found)
}

/// How many live tasks sit in `lane`.
pub fn count_live_in(txn: &Txn, lane: &Lane) -> Result<u32, StoreError> {
    Ok(txn.conn().query_row(
        "SELECT count(*) FROM task WHERE deleted_at IS NULL AND lane = ?1",
        [lane.as_str()],
        |row| row.get(0),
    )?)
}

/// Every lane that holds at least one live task, each once, in no set order.
pub fn lanes_live(txn: &Txn) -> Result<Vec<Lane>, StoreError> {
    let mut stmt = txn
        .conn()
        .prepare("SELECT DISTINCT lane FROM task WHERE deleted_at IS NULL")?;
    let rows = stmt.query_map([], |row| parsed(row, 0, Lane::parse))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// The greatest rank in the Backlog, removed tasks included (as the merge's `end_of_lane`), so
/// a rank placed after it never ties one. `None` when the lane has never held a task.
pub fn last_backlog_rank(txn: &Txn) -> Result<Option<String>, StoreError> {
    Ok(txn.conn().query_row(
        "SELECT max(rank) FROM task WHERE lane = 'backlog'",
        [],
        |row| row.get(0),
    )?)
}

/// Tombstones a live task at `at` and logs `deleted_at`. Returns whether a row changed: a
/// removed or missing task changes nothing.
pub fn remove(txn: &mut Txn, id: &str, at: u64) -> Result<bool, StoreError> {
    set_deleted(txn, id, Some(at))
}

/// Brings a removed task back and logs `deleted_at = null`. Returns whether a row changed: a
/// live or missing task changes nothing.
pub fn restore(txn: &mut Txn, id: &str) -> Result<bool, StoreError> {
    set_deleted(txn, id, None)
}

fn set_deleted(txn: &mut Txn, id: &str, deleted_at: Option<u64>) -> Result<bool, StoreError> {
    let from = if deleted_at.is_some() {
        "deleted_at IS NULL"
    } else {
        "deleted_at IS NOT NULL"
    };
    let changed = txn.conn().execute(
        &format!("UPDATE task SET deleted_at = ?2, updated_at = ?3 WHERE id = ?1 AND {from}"),
        rusqlite::params![
            id,
            deleted_at.map(sql_int).transpose()?,
            sql_int(txn.now_ms())?
        ],
    )?;
    if changed == 0 {
        return Ok(false);
    }
    txn.log_fields(
        Entity::Task,
        id,
        &[("deleted_at", deleted_at.map_or(Value::Null, Value::from))],
    )?;
    Ok(true)
}

/// Per task, the sum of `focused_ms` and the number of focus rows linked to it (not breaks, not
/// tombstones). Tasks with no such row are absent. Ordered by task id.
pub fn tracked(txn: &Txn) -> Result<Vec<Tracked>, StoreError> {
    let mut stmt = txn.conn().prepare(
        "SELECT task_id, sum(focused_ms), count(*) FROM focus_session
         WHERE task_id IS NOT NULL AND phase = 'focus' AND deleted_at IS NULL
         GROUP BY task_id ORDER BY task_id",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Tracked {
            task_id: row.get(0)?,
            focused_ms: unsigned(1, row.get(1)?)?,
            sessions: u32::try_from(row.get::<_, i64>(2)?)
                .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(2, 0))?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn unsigned(index: usize, ms: i64) -> rusqlite::Result<u64> {
    u64::try_from(ms).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(index, ms))
}

fn bad(index: usize, what: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(index, rusqlite::types::Type::Text, what.into())
}

fn json<T: serde::de::DeserializeOwned>(row: &rusqlite::Row, index: usize) -> rusqlite::Result<T> {
    let text: String = row.get(index)?;
    serde_json::from_str(&text).map_err(|e| bad(index, format!("stored JSON: {e}")))
}

fn parsed<T>(
    row: &rusqlite::Row,
    index: usize,
    parse: fn(&str) -> Option<T>,
) -> rusqlite::Result<T> {
    let text: String = row.get(index)?;
    parse(&text).ok_or_else(|| bad(index, format!("unknown value {text}")))
}

fn read_row(row: &rusqlite::Row) -> rusqlite::Result<TaskRow> {
    let opt_ms = |index: usize| {
        row.get::<_, Option<i64>>(index)?
            .map(|v| unsigned(index, v))
            .transpose()
    };
    let priority: Option<String> = row.get(7)?;
    Ok(TaskRow {
        id: row.get(0)?,
        title: row.get(1)?,
        notes: row.get(2)?,
        tags: json(row, 3)?,
        kind: parsed(row, 4, TaskKind::parse)?,
        estimate: row.get(5)?,
        due: row.get(6)?,
        priority: priority
            .map(|p| Priority::parse(&p).ok_or_else(|| bad(7, format!("unknown value {p}"))))
            .transpose()?,
        checklist: json(row, 8)?,
        lane: parsed(row, 9, Lane::parse)?,
        rank: row.get(10)?,
        frog_day: row.get(11)?,
        breakdown_dismissed: row.get::<_, i64>(12)? != 0,
        source_note_id: row.get(13)?,
        done_at: opt_ms(14)?,
        created_at: unsigned(15, row.get(15)?)?,
        updated_at: unsigned(16, row.get(16)?)?,
        deleted_at: opt_ms(17)?,
        origin: row.get(18)?,
    })
}

#[cfg(test)]
mod tests;
