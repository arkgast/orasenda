//! Every row of the `reflection` table (migration 0010), tombstones included.

use crate::StoreError;
use rusqlite::Connection;

/// A `reflection` row. `priorities` is the stored JSON text, so a foreign file's bad value
/// reaches the merge, which refuses it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReflectionRowAll {
    pub id: String,
    pub kind: String,
    pub period: String,
    pub went_well: Option<String>,
    pub to_improve: Option<String>,
    pub outside_control: Option<String>,
    pub improvement: Option<String>,
    pub notes: Option<String>,
    pub priorities: String,
    pub completed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

const COLUMNS: &str = "id, kind, period, went_well, to_improve, outside_control, improvement, \
                       notes, priorities, completed_at, created_at, updated_at, deleted_at";

pub(super) fn read(conn: &Connection) -> Result<Vec<ReflectionRowAll>, StoreError> {
    Ok(conn
        .prepare(&format!("SELECT {COLUMNS} FROM reflection ORDER BY id"))?
        .query_map([], read_row)?
        .collect::<Result<_, _>>()?)
}

/// The row with `id`, removed or not.
pub(super) fn get(conn: &Connection, id: &str) -> Result<Option<ReflectionRowAll>, StoreError> {
    Ok(conn
        .prepare(&format!("SELECT {COLUMNS} FROM reflection WHERE id = ?1"))?
        .query_map([id], read_row)?
        .next()
        .transpose()?)
}

fn read_row(row: &rusqlite::Row) -> rusqlite::Result<ReflectionRowAll> {
    Ok(ReflectionRowAll {
        id: row.get(0)?,
        kind: row.get(1)?,
        period: row.get(2)?,
        went_well: row.get(3)?,
        to_improve: row.get(4)?,
        outside_control: row.get(5)?,
        improvement: row.get(6)?,
        notes: row.get(7)?,
        priorities: row.get(8)?,
        completed_at: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        deleted_at: row.get(12)?,
    })
}
