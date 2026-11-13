//! The Inbox. **Syncable**: every write logs to `change_log` with `entity = "inbox_note"` and
//! `entity_id` = the note id (ADR-002, ADR-012). A removed note is a tombstone (`deleted_at`),
//! never a deleted row, so Undo can bring it back. Trimming and the kind rules are the
//! service's; the CHECKs in the table are the last line.

use crate::{Entity, StoreError, Txn, sql_int};
use serde_json::Value;

/// Whether a note is about the user's own work or about something outside it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoteKind {
    Internal,
    External,
}

impl NoteKind {
    fn as_str(self) -> &'static str {
        match self {
            NoteKind::Internal => "internal",
            NoteKind::External => "external",
        }
    }

    fn parse(text: &str) -> Option<NoteKind> {
        match text {
            "internal" => Some(NoteKind::Internal),
            "external" => Some(NoteKind::External),
            _ => None,
        }
    }
}

/// A note to insert. `id` is a UUIDv7 made by the caller.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewNote {
    pub id: String,
    pub text: String,
    pub kind: NoteKind,
    pub created_at: u64,
}

/// A stored note.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteRow {
    pub id: String,
    pub text: String,
    pub kind: NoteKind,
    pub created_at: u64,
    pub deleted_at: Option<u64>,
}

/// Inserts a live note and logs `text`, `kind` and `created_at`. A text outside 1 to 1000
/// characters, or a repeated id, fails and writes nothing.
pub fn insert(txn: &mut Txn, note: &NewNote) -> Result<(), StoreError> {
    txn.conn().execute(
        "INSERT INTO inbox_note (id, text, kind, created_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![
            note.id,
            note.text,
            note.kind.as_str(),
            sql_int(note.created_at)?
        ],
    )?;
    txn.log_fields(
        Entity::InboxNote,
        &note.id,
        &[
            ("text", Value::from(note.text.clone())),
            ("kind", Value::from(note.kind.as_str())),
            ("created_at", Value::from(note.created_at)),
        ],
    )
}

/// The live notes, newest first.
pub fn list_live(txn: &Txn) -> Result<Vec<NoteRow>, StoreError> {
    let mut stmt = txn.conn().prepare(
        "SELECT id, text, kind, created_at, deleted_at FROM inbox_note
         WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC",
    )?;
    let rows = stmt.query_map([], read_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Tombstones a live note at `at` and logs `deleted_at`. Returns whether a row changed: a
/// removed or missing note changes nothing.
pub fn remove(txn: &mut Txn, id: &str, at: u64) -> Result<bool, StoreError> {
    set_deleted(txn, id, Some(at))
}

/// Brings a removed note back and logs `deleted_at = null`. Returns whether a row changed: a
/// live or missing note changes nothing.
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
        &format!("UPDATE inbox_note SET deleted_at = ?2 WHERE id = ?1 AND {from}"),
        rusqlite::params![id, deleted_at.map(sql_int).transpose()?],
    )?;
    if changed == 0 {
        return Ok(false);
    }
    txn.log_fields(
        Entity::InboxNote,
        id,
        &[("deleted_at", deleted_at.map_or(Value::Null, Value::from))],
    )?;
    Ok(true)
}

fn read_row(row: &rusqlite::Row) -> rusqlite::Result<NoteRow> {
    let unsigned = |index: usize, ms: i64| {
        u64::try_from(ms).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(index, ms))
    };
    let kind: String = row.get(2)?;
    Ok(NoteRow {
        id: row.get(0)?,
        text: row.get(1)?,
        kind: NoteKind::parse(&kind).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                2,
                rusqlite::types::Type::Text,
                format!("unknown note kind {kind}").into(),
            )
        })?,
        created_at: unsigned(3, row.get(3)?)?,
        deleted_at: row
            .get::<_, Option<i64>>(4)?
            .map(|ms| unsigned(4, ms))
            .transpose()?,
    })
}

#[cfg(test)]
mod tests;
