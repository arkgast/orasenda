//! Reflections. **Syncable**: every write logs to `change_log` with `entity = "reflection"` and
//! `entity_id` = the reflection id, `shutdown:<YYYY-MM-DD>` or `week:<YYYY-MM-DD>` (the planned
//! week's Monday), so two devices that reflect on the same period write the same row. There is
//! one row per `(kind, period)`; saving again updates it. A removed row is a tombstone
//! (`deleted_at`). Trimming, the length limits and the 0 to 3 priorities are the service's; the
//! CHECKs in the table are the last line. Days are local ISO dates made by the caller.

use crate::{Entity, StoreError, Txn, sql_int};
use serde_json::Value;

/// Which flow wrote a reflection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReflectionKind {
    Shutdown,
    Week,
}

impl ReflectionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ReflectionKind::Shutdown => "shutdown",
            ReflectionKind::Week => "week",
        }
    }

    fn parse(text: &str) -> Option<ReflectionKind> {
        match text {
            "shutdown" => Some(ReflectionKind::Shutdown),
            "week" => Some(ReflectionKind::Week),
            _ => None,
        }
    }
}

/// The id of the reflection of `kind` for `period`.
pub fn reflection_id(kind: ReflectionKind, period: &str) -> String {
    format!("{}:{period}", kind.as_str())
}

/// The full content of one reflection, as the flow saves it. Fields of the other kind stay
/// `None` or empty; the table refuses them otherwise.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReflectionWrite {
    pub kind: ReflectionKind,
    /// The shutdown day, or the planned week's Monday, `YYYY-MM-DD`.
    pub period: String,
    pub went_well: Option<String>,
    pub to_improve: Option<String>,
    pub outside_control: Option<String>,
    pub improvement: Option<String>,
    pub notes: Option<String>,
    pub priorities: Vec<String>,
    /// The flow reached its last step. The first `true` sets `completed_at`; later saves keep it.
    pub complete: bool,
}

/// A stored reflection.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReflectionRow {
    pub id: String,
    pub kind: ReflectionKind,
    pub period: String,
    pub went_well: Option<String>,
    pub to_improve: Option<String>,
    pub outside_control: Option<String>,
    pub improvement: Option<String>,
    pub notes: Option<String>,
    pub priorities: Vec<String>,
    pub completed_at: Option<u64>,
    pub created_at: u64,
    pub updated_at: u64,
    pub deleted_at: Option<u64>,
}

const COLUMNS: &str = "id, kind, period, went_well, to_improve, outside_control, improvement, \
                       notes, priorities, completed_at, created_at, updated_at, deleted_at";

/// The reflection with `id`, removed or not.
pub fn get(txn: &Txn, id: &str) -> Result<Option<ReflectionRow>, StoreError> {
    let mut stmt = txn
        .conn()
        .prepare(&format!("SELECT {COLUMNS} FROM reflection WHERE id = ?1"))?;
    let mut rows = stmt.query_map([id], read_row)?;
    Ok(rows.next().transpose()?)
}

/// The live reflections of `kind` whose period is in `from_period..=to_period`, oldest first.
pub fn list(
    txn: &Txn,
    kind: ReflectionKind,
    from_period: &str,
    to_period: &str,
) -> Result<Vec<ReflectionRow>, StoreError> {
    let mut stmt = txn.conn().prepare(&format!(
        "SELECT {COLUMNS} FROM reflection
         WHERE kind = ?1 AND period >= ?2 AND period <= ?3 AND deleted_at IS NULL
         ORDER BY period"
    ))?;
    let rows = stmt.query_map(
        rusqlite::params![kind.as_str(), from_period, to_period],
        read_row,
    )?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Saves `write` at `txn.now_ms()`: inserts the row, or updates the one of the same kind and
/// period, and logs only the fields that changed. An unchanged write touches nothing and logs
/// nothing. `completed_at` is set by the first `complete = true` and kept afterwards; a save
/// with `complete = false` never clears it. A removed row comes back. Returns the row id.
pub fn upsert(txn: &mut Txn, write: &ReflectionWrite) -> Result<String, StoreError> {
    let id = reflection_id(write.kind, &write.period);
    let now = txn.now_ms();
    let priorities = serde_json::to_string(&write.priorities)?;
    let Some(old) = get(txn, &id)? else {
        let completed_at = write.complete.then_some(now);
        txn.conn().execute(
            "INSERT INTO reflection (id, kind, period, went_well, to_improve, outside_control,
                 improvement, notes, priorities, completed_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
            rusqlite::params![
                id,
                write.kind.as_str(),
                write.period,
                write.went_well,
                write.to_improve,
                write.outside_control,
                write.improvement,
                write.notes,
                priorities,
                completed_at.map(sql_int).transpose()?,
                sql_int(now)?,
            ],
        )?;
        let mut fields = vec![
            ("kind", Value::from(write.kind.as_str())),
            ("period", Value::from(write.period.clone())),
        ];
        fields.extend(text_fields(write).into_iter().filter(|(_, v)| !v.is_null()));
        if !write.priorities.is_empty() {
            fields.push(("priorities", Value::from(write.priorities.clone())));
        }
        if let Some(at) = completed_at {
            fields.push(("completed_at", Value::from(at)));
        }
        fields.push(("created_at", Value::from(now)));
        txn.log_fields(Entity::Reflection, &id, &fields)?;
        return Ok(id);
    };
    let old_texts = text_fields(&row_as_write(&old));
    let mut changed: Vec<(&'static str, Value)> = text_fields(write)
        .into_iter()
        .zip(old_texts)
        .filter(|(new, old)| new.1 != old.1)
        .map(|(new, _)| new)
        .collect();
    if write.priorities != old.priorities {
        changed.push(("priorities", Value::from(write.priorities.clone())));
    }
    let completed_at = match old.completed_at {
        Some(at) => Some(at),
        None => write.complete.then_some(now),
    };
    if completed_at != old.completed_at {
        changed.push((
            "completed_at",
            completed_at.map_or(Value::Null, Value::from),
        ));
    }
    if old.deleted_at.is_some() {
        changed.push(("deleted_at", Value::Null));
    }
    if changed.is_empty() {
        return Ok(id);
    }
    txn.conn().execute(
        "UPDATE reflection SET went_well = ?2, to_improve = ?3, outside_control = ?4,
             improvement = ?5, notes = ?6, priorities = ?7, completed_at = ?8,
             updated_at = ?9, deleted_at = NULL
         WHERE id = ?1",
        rusqlite::params![
            id,
            write.went_well,
            write.to_improve,
            write.outside_control,
            write.improvement,
            write.notes,
            priorities,
            completed_at.map(sql_int).transpose()?,
            sql_int(now)?,
        ],
    )?;
    txn.log_fields(Entity::Reflection, &id, &changed)?;
    Ok(id)
}

/// The five text columns with their field names, in column order.
fn text_fields(write: &ReflectionWrite) -> Vec<(&'static str, Value)> {
    let text = |value: &Option<String>| value.clone().map_or(Value::Null, Value::from);
    vec![
        ("went_well", text(&write.went_well)),
        ("to_improve", text(&write.to_improve)),
        ("outside_control", text(&write.outside_control)),
        ("improvement", text(&write.improvement)),
        ("notes", text(&write.notes)),
    ]
}

fn row_as_write(row: &ReflectionRow) -> ReflectionWrite {
    ReflectionWrite {
        kind: row.kind,
        period: row.period.clone(),
        went_well: row.went_well.clone(),
        to_improve: row.to_improve.clone(),
        outside_control: row.outside_control.clone(),
        improvement: row.improvement.clone(),
        notes: row.notes.clone(),
        priorities: row.priorities.clone(),
        complete: row.completed_at.is_some(),
    }
}

fn read_row(row: &rusqlite::Row) -> rusqlite::Result<ReflectionRow> {
    let conversion = |index: usize, message: String| {
        rusqlite::Error::FromSqlConversionFailure(
            index,
            rusqlite::types::Type::Text,
            message.into(),
        )
    };
    let unsigned = |index: usize| -> rusqlite::Result<u64> {
        let ms: i64 = row.get(index)?;
        u64::try_from(ms).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(index, ms))
    };
    let opt_unsigned = |index: usize| -> rusqlite::Result<Option<u64>> {
        row.get::<_, Option<i64>>(index)?
            .map(|ms| {
                u64::try_from(ms).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(index, ms))
            })
            .transpose()
    };
    let kind: String = row.get(1)?;
    let priorities: String = row.get(8)?;
    Ok(ReflectionRow {
        id: row.get(0)?,
        kind: ReflectionKind::parse(&kind)
            .ok_or_else(|| conversion(1, format!("unknown reflection kind {kind}")))?,
        period: row.get(2)?,
        went_well: row.get(3)?,
        to_improve: row.get(4)?,
        outside_control: row.get(5)?,
        improvement: row.get(6)?,
        notes: row.get(7)?,
        priorities: serde_json::from_str(&priorities)
            .map_err(|e| conversion(8, format!("priorities is not a list of text: {e}")))?,
        completed_at: opt_unsigned(9)?,
        created_at: unsigned(10)?,
        updated_at: unsigned(11)?,
        deleted_at: opt_unsigned(12)?,
    })
}

#[cfg(test)]
mod tests;
