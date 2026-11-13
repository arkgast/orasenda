//! `focus_session`: the file's row wins whole when its `updated_at` is later.

use super::{Outcome, local_updated_at, opt};
use crate::portability::SessionRowAll;
use crate::{Entity, StoreError, Txn};
use serde_json::Value;

pub(super) fn merge_row(txn: &mut Txn, row: &SessionRowAll) -> Result<Outcome, StoreError> {
    let local = local_updated_at(txn, "focus_session", "id", &row.id)?;
    if local.is_some_and(|at| row.updated_at <= at) {
        return Ok(Outcome::Kept);
    }
    txn.conn().execute(
        "INSERT OR REPLACE INTO focus_session (id, created_at, updated_at, deleted_at, preset,
             phase, planned_ms, started_at, ended_at, paused_total_ms, focused_ms, end_reason,
             extensions, intent, preset_id, preset_name, focus_min, break_min, long_break_min,
             rounds, break_kind)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18,
             ?19, ?20, ?21)",
        rusqlite::params![
            row.id,
            row.created_at,
            row.updated_at,
            row.deleted_at,
            row.preset,
            row.phase,
            row.planned_ms,
            row.started_at,
            row.ended_at,
            row.paused_total_ms,
            row.focused_ms,
            row.end_reason,
            row.extensions,
            row.intent,
            row.preset_id,
            row.preset_name,
            row.focus_min,
            row.break_min,
            row.long_break_min,
            row.rounds,
            row.break_kind,
        ],
    )?;
    let mut fields = vec![
        ("preset", Value::from(row.preset.clone())),
        ("phase", Value::from(row.phase.clone())),
        ("planned_ms", Value::from(row.planned_ms)),
        ("started_at", Value::from(row.started_at)),
        ("ended_at", Value::from(row.ended_at)),
        ("paused_total_ms", Value::from(row.paused_total_ms)),
        ("focused_ms", Value::from(row.focused_ms)),
        ("end_reason", Value::from(row.end_reason.clone())),
        ("extensions", Value::from(row.extensions)),
    ];
    // The columns a session may lack are logged when it has them, as an insert does.
    let optional = [
        ("preset_id", opt(row.preset_id.clone())),
        ("preset_name", opt(row.preset_name.clone())),
        ("focus_min", opt(row.focus_min)),
        ("break_min", opt(row.break_min)),
        ("long_break_min", opt(row.long_break_min)),
        ("rounds", opt(row.rounds)),
        ("intent", opt(row.intent.clone())),
        ("break_kind", opt(row.break_kind.clone())),
    ];
    fields.extend(optional.into_iter().filter(|(_, v)| !v.is_null()));
    if row.deleted_at.is_some() || local.is_some() {
        fields.push(("deleted_at", opt(row.deleted_at)));
    }
    txn.log_fields(Entity::FocusSession, &row.id, &fields)?;
    Ok(if local.is_some() {
        Outcome::Updated
    } else {
        Outcome::Added
    })
}
