//! The transaction handle repositories work on, and the change-log writer.

use crate::StoreError;
use orasenda_core::{Hlc, HlcStamp};
use rusqlite::Connection;

/// A syncable entity: the `change_log.entity` value for its rows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Entity {
    Setting,
    FocusSession,
}

impl Entity {
    /// The table that holds the entity, also written as `change_log.entity`.
    pub fn table(&self) -> &'static str {
        match self {
            Entity::Setting => "setting",
            Entity::FocusSession => "focus_session",
        }
    }
}

/// One open SQLite transaction, handed to the closure of [`crate::Store::read`] (as `&Txn`) or
/// [`crate::Store::write`] (as `&mut Txn`).
pub struct Txn<'a> {
    conn: &'a Connection,
    now_ms: u64,
    device_id: &'a str,
    clock: &'a mut Hlc,
    last_stamp: Option<HlcStamp>,
}

impl<'a> Txn<'a> {
    pub(crate) fn new(
        conn: &'a Connection,
        now_ms: u64,
        device_id: &'a str,
        clock: &'a mut Hlc,
    ) -> Txn<'a> {
        Txn {
            conn,
            now_ms,
            device_id,
            clock,
            last_stamp: None,
        }
    }

    pub(crate) fn conn(&self) -> &Connection {
        self.conn
    }

    /// The `now_ms` passed to `write`: what repositories store as `updated_at`. 0 in a read.
    pub fn now_ms(&self) -> u64 {
        self.now_ms
    }

    /// Appends one `change_log` row per field, each with its own clock stamp and this device's
    /// id. Writes no entity row: the repository writes its own row first, in this transaction.
    ///
    /// Field names are `&'static str` and the values travel as SQL parameters, so nothing a
    /// user typed ever becomes SQL text.
    pub fn log_fields(
        &mut self,
        entity: Entity,
        entity_id: &str,
        fields: &[(&'static str, serde_json::Value)],
    ) -> Result<(), StoreError> {
        let mut insert = self.conn.prepare(
            "INSERT INTO change_log (hlc, device_id, entity, entity_id, field, value)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )?;
        for (field, value) in fields {
            let stamp = self.clock.tick(self.now_ms);
            insert.execute((
                stamp.to_string(),
                self.device_id,
                entity.table(),
                entity_id,
                field,
                serde_json::to_string(value)?,
            ))?;
            self.last_stamp = Some(stamp);
        }
        Ok(())
    }

    /// The last stamp handed out in this transaction, if any.
    pub(crate) fn into_last_stamp(self) -> Option<HlcStamp> {
        self.last_stamp
    }
}
