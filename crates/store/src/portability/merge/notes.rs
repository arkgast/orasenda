//! `inbox_note`: no `updated_at`. A `deleted_at` on either side wins; nothing else changes.

use super::Outcome;
use crate::portability::NoteRowAll;
use crate::{Entity, StoreError, Txn};
use rusqlite::OptionalExtension;
use serde_json::Value;

pub(super) fn merge_row(txn: &mut Txn, row: &NoteRowAll) -> Result<Outcome, StoreError> {
    let local: Option<Option<i64>> = txn
        .conn()
        .query_row(
            "SELECT deleted_at FROM inbox_note WHERE id = ?1",
            [&row.id],
            |r| r.get(0),
        )
        .optional()?;
    match local {
        None => {
            txn.conn().execute(
                "INSERT INTO inbox_note (id, text, kind, created_at, deleted_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                (
                    &row.id,
                    &row.text,
                    &row.kind,
                    row.created_at,
                    row.deleted_at,
                ),
            )?;
            let mut fields = vec![
                ("text", Value::from(row.text.clone())),
                ("kind", Value::from(row.kind.clone())),
                ("created_at", Value::from(row.created_at)),
            ];
            if let Some(at) = row.deleted_at {
                fields.push(("deleted_at", Value::from(at)));
            }
            txn.log_fields(Entity::InboxNote, &row.id, &fields)?;
            Ok(Outcome::Added)
        }
        Some(None) if row.deleted_at.is_some() => {
            txn.conn().execute(
                "UPDATE inbox_note SET deleted_at = ?2 WHERE id = ?1",
                (&row.id, row.deleted_at),
            )?;
            txn.log_fields(
                Entity::InboxNote,
                &row.id,
                &[("deleted_at", Value::from(row.deleted_at))],
            )?;
            Ok(Outcome::Updated)
        }
        Some(_) => Ok(Outcome::Kept),
    }
}
