//! Every row of the four syncable tables, tombstones included, as plain structs.

use crate::{StoreError, Txn};

/// A `setting` row: `value` is the stored JSON text.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SettingRow {
    pub key: String,
    pub value: String,
    pub updated_at: i64,
}

/// A `preset` row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PresetRowAll {
    pub id: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    pub name: String,
    pub focus_min: i64,
    pub break_min: i64,
    pub long_break_min: i64,
    pub rounds: i64,
    pub position: i64,
    pub default_key: Option<String>,
}

/// A `focus_session` row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionRowAll {
    pub id: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    pub preset: String,
    pub phase: String,
    pub planned_ms: i64,
    pub started_at: i64,
    pub ended_at: i64,
    pub paused_total_ms: i64,
    pub focused_ms: i64,
    pub end_reason: String,
    pub extensions: i64,
    pub intent: Option<String>,
    pub preset_id: Option<String>,
    pub preset_name: Option<String>,
    pub focus_min: Option<i64>,
    pub break_min: Option<i64>,
    pub long_break_min: Option<i64>,
    pub rounds: Option<i64>,
    pub break_kind: Option<String>,
}

/// An `inbox_note` row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteRowAll {
    pub id: String,
    pub text: String,
    pub kind: String,
    pub created_at: i64,
    pub deleted_at: Option<i64>,
}

/// Everything import merges.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SyncRows {
    pub settings: Vec<SettingRow>,
    pub presets: Vec<PresetRowAll>,
    pub sessions: Vec<SessionRowAll>,
    pub notes: Vec<NoteRowAll>,
}

/// Reads every row of the syncable tables, removed ones included.
pub fn rows(txn: &Txn) -> Result<SyncRows, StoreError> {
    let conn = txn.conn();
    let settings = conn
        .prepare("SELECT key, value, updated_at FROM setting ORDER BY key")?
        .query_map([], |row| {
            Ok(SettingRow {
                key: row.get(0)?,
                value: row.get(1)?,
                updated_at: row.get(2)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    let presets = conn
        .prepare(
            "SELECT id, created_at, updated_at, deleted_at, name, focus_min, break_min,
                 long_break_min, rounds, position, default_key
             FROM preset ORDER BY id",
        )?
        .query_map([], |row| {
            Ok(PresetRowAll {
                id: row.get(0)?,
                created_at: row.get(1)?,
                updated_at: row.get(2)?,
                deleted_at: row.get(3)?,
                name: row.get(4)?,
                focus_min: row.get(5)?,
                break_min: row.get(6)?,
                long_break_min: row.get(7)?,
                rounds: row.get(8)?,
                position: row.get(9)?,
                default_key: row.get(10)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    let sessions = conn
        .prepare(
            "SELECT id, created_at, updated_at, deleted_at, preset, phase, planned_ms,
                 started_at, ended_at, paused_total_ms, focused_ms, end_reason, extensions,
                 intent, preset_id, preset_name, focus_min, break_min, long_break_min, rounds,
                 break_kind
             FROM focus_session ORDER BY id",
        )?
        .query_map([], |row| {
            Ok(SessionRowAll {
                id: row.get(0)?,
                created_at: row.get(1)?,
                updated_at: row.get(2)?,
                deleted_at: row.get(3)?,
                preset: row.get(4)?,
                phase: row.get(5)?,
                planned_ms: row.get(6)?,
                started_at: row.get(7)?,
                ended_at: row.get(8)?,
                paused_total_ms: row.get(9)?,
                focused_ms: row.get(10)?,
                end_reason: row.get(11)?,
                extensions: row.get(12)?,
                intent: row.get(13)?,
                preset_id: row.get(14)?,
                preset_name: row.get(15)?,
                focus_min: row.get(16)?,
                break_min: row.get(17)?,
                long_break_min: row.get(18)?,
                rounds: row.get(19)?,
                break_kind: row.get(20)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    let notes = conn
        .prepare("SELECT id, text, kind, created_at, deleted_at FROM inbox_note ORDER BY id")?
        .query_map([], |row| {
            Ok(NoteRowAll {
                id: row.get(0)?,
                text: row.get(1)?,
                kind: row.get(2)?,
                created_at: row.get(3)?,
                deleted_at: row.get(4)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(SyncRows {
        settings,
        presets,
        sessions,
        notes,
    })
}
