//! `reflection`: the one table merged per field (spec 2026-11-16), not by the later row whole.
//!
//! On both sides: each text field takes the later `updated_at`'s value, but a NULL never
//! overwrites the other side's text; `priorities` and `deleted_at` follow the later `updated_at`
//! (a tie keeps the local row); `completed_at` is the earliest non-null value. A row only in
//! the file is inserted. Only the fields that changed are logged, like `reflections::upsert`.
//! A `priorities` value that is not a JSON array of text fails the whole import.

use super::{Outcome, opt};
use crate::portability::ReflectionRowAll;
use crate::portability::reflection_rows::get;
use crate::{Entity, StoreError, Txn};
use serde_json::Value;

const TEXTS: [&str; 5] = [
    "went_well",
    "to_improve",
    "outside_control",
    "improvement",
    "notes",
];

fn texts(row: &ReflectionRowAll) -> [&Option<String>; 5] {
    [
        &row.went_well,
        &row.to_improve,
        &row.outside_control,
        &row.improvement,
        &row.notes,
    ]
}

fn canonical(priorities: &[String]) -> Result<String, StoreError> {
    serde_json::to_string(priorities).map_err(|e| StoreError::Json(e.to_string()))
}

fn priority_list(row: &ReflectionRowAll) -> Result<Vec<String>, StoreError> {
    serde_json::from_str(&row.priorities).map_err(|e| {
        StoreError::Json(format!(
            "reflection {} priorities is not a list of text: {e}",
            row.id
        ))
    })
}

pub(super) fn merge_row(txn: &mut Txn, file: &ReflectionRowAll) -> Result<Outcome, StoreError> {
    let priorities = priority_list(file)?;
    let Some(local) = get(txn.conn(), &file.id)? else {
        return insert(txn, file, priorities);
    };
    let file_wins = file.updated_at > local.updated_at;
    let mut merged = local.clone();
    let mut changed: Vec<(&'static str, Value)> = Vec::new();
    let (local_texts, file_texts) = (texts(&local), texts(file));
    let targets = [
        &mut merged.went_well,
        &mut merged.to_improve,
        &mut merged.outside_control,
        &mut merged.improvement,
        &mut merged.notes,
    ];
    for (i, target) in targets.into_iter().enumerate() {
        let (winner, other) = if file_wins {
            (file_texts[i], local_texts[i])
        } else {
            (local_texts[i], file_texts[i])
        };
        let value = winner.clone().or_else(|| other.clone());
        if value != *local_texts[i] {
            changed.push((TEXTS[i], opt(value.clone())));
        }
        *target = value;
    }
    if file_wins && priorities != priority_list(&local)? {
        merged.priorities = canonical(&priorities)?;
        changed.push(("priorities", Value::from(priorities)));
    }
    merged.completed_at = match (local.completed_at, file.completed_at) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (a, b) => a.or(b),
    };
    if merged.completed_at != local.completed_at {
        changed.push(("completed_at", opt(merged.completed_at)));
    }
    if file_wins && file.deleted_at != local.deleted_at {
        merged.deleted_at = file.deleted_at;
        changed.push(("deleted_at", opt(file.deleted_at)));
    }
    if changed.is_empty() {
        return Ok(Outcome::Kept);
    }
    merged.updated_at = local.updated_at.max(file.updated_at);
    txn.conn().execute(
        "UPDATE reflection SET went_well = ?2, to_improve = ?3, outside_control = ?4,
             improvement = ?5, notes = ?6, priorities = ?7, completed_at = ?8,
             updated_at = ?9, deleted_at = ?10
         WHERE id = ?1",
        rusqlite::params![
            merged.id,
            merged.went_well,
            merged.to_improve,
            merged.outside_control,
            merged.improvement,
            merged.notes,
            merged.priorities,
            merged.completed_at,
            merged.updated_at,
            merged.deleted_at,
        ],
    )?;
    txn.log_fields(Entity::Reflection, &file.id, &changed)?;
    Ok(Outcome::Updated)
}

fn insert(
    txn: &mut Txn,
    row: &ReflectionRowAll,
    priorities: Vec<String>,
) -> Result<Outcome, StoreError> {
    let canonical_priorities = canonical(&priorities)?;
    txn.conn().execute(
        "INSERT INTO reflection (id, kind, period, went_well, to_improve, outside_control,
             improvement, notes, priorities, completed_at, created_at, updated_at, deleted_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        rusqlite::params![
            row.id,
            row.kind,
            row.period,
            row.went_well,
            row.to_improve,
            row.outside_control,
            row.improvement,
            row.notes,
            canonical_priorities,
            row.completed_at,
            row.created_at,
            row.updated_at,
            row.deleted_at,
        ],
    )?;
    let mut fields = vec![
        ("kind", Value::from(row.kind.clone())),
        ("period", Value::from(row.period.clone())),
    ];
    for (name, text) in TEXTS.iter().zip(texts(row)) {
        if text.is_some() {
            fields.push((*name, opt(text.clone())));
        }
    }
    if !priorities.is_empty() {
        fields.push(("priorities", Value::from(priorities)));
    }
    if let Some(at) = row.completed_at {
        fields.push(("completed_at", Value::from(at)));
    }
    fields.push(("created_at", Value::from(row.created_at)));
    if let Some(at) = row.deleted_at {
        fields.push(("deleted_at", Value::from(at)));
    }
    txn.log_fields(Entity::Reflection, &row.id, &fields)?;
    Ok(Outcome::Added)
}
