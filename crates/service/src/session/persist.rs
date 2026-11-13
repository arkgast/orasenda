//! Writing the engine state and the owed records to the store.

use orasenda_core::SessionRecord;
use orasenda_store::{StoreError, Txn, active_session, focus_sessions};

use super::*;
use crate::api::{StoreStatus, TimerView};

impl SessionService {
    /// Records what the engine change owes the store, then tries to write it at once.
    pub(super) fn persist(&mut self, now_ms: u64, finished: Vec<SessionRecord>) {
        if self.store.is_none() {
            return;
        }
        self.unsaved.extend(finished);
        self.snapshot_dirty = true;
        // A failure is logged, kept in `unsaved`/`snapshot_dirty` and shown in the view.
        let _ = self.write_owed(now_ms, |_| Ok(()));
    }

    /// One transaction: insert `unsaved`, write the **current** snapshot (put while running
    /// or paused, clear while idle), then `extra`. Clears what was owed only on success.
    pub(super) fn write_owed(
        &mut self,
        now_ms: u64,
        extra: impl FnOnce(&mut Txn) -> Result<(), StoreError>,
    ) -> Result<(), StoreError> {
        let Some(store) = &self.store else {
            return Err(StoreError::Closed);
        };
        let row_unread = self.recover_owed.snapshot;
        let auto = self.auto_longest_ms();
        // The id a break takes if the unread row held a focus whose end has passed.
        let break_id = row_unread.then(|| (self.ids)());
        let (unsaved, engine) = (&self.unsaved, &self.engine);
        let written = store.write(now_ms, |txn| {
            // The launch read of the row failed: whatever session it holds predates this
            // run, so it is recorded as ended before the row is replaced.
            let found = if row_unread {
                unread_row(txn, now_ms, auto, break_id.clone())?
            } else {
                RowFound::Nothing
            };
            if let RowFound::Ended(records) = &found {
                for record in records {
                    focus_sessions::insert(txn, record)?;
                }
            }
            for record in unsaved {
                focus_sessions::insert(txn, record)?;
            }
            if engine.is_idle() {
                // An undecodable row is left in place, as at launch.
                if !matches!(found, RowFound::Undecodable) {
                    active_session::clear(txn)?;
                }
            } else {
                active_session::put(txn, engine)?;
            }
            extra(txn)?;
            Ok(found)
        });
        let written = written.map(|found| {
            self.recover_owed.snapshot = false;
            if let RowFound::Ended(records) = found
                && let Some(event) = recovered(&records)
            {
                self.pending.push(event);
            }
        });
        match &written {
            Ok(()) => {
                self.unsaved.clear();
                self.snapshot_dirty = false;
                // Rows may have been added: read today's again, and let the read say whether
                // the store works.
                self.day_cache.bump();
                // Deliberately beyond the spec: a working write clears a failed read until the
                // next read fails, so the store line does not stay up through a focus.
                self.day_read_failed.set(false);
                self.refresh_status();
            }
            Err(error) => {
                // Logged once per entry into the degraded state, not per retry.
                if self.store_status == StoreStatus::Ok {
                    eprintln!("store: a write failed ({error}); retrying every second");
                }
                self.store_status = StoreStatus::Unavailable;
            }
        }
        written
    }

    /// Writes anything owed (`unsaved` and the current snapshot). Does nothing when nothing
    /// is owed or there is no store.
    pub fn flush(&mut self, now_ms: u64) {
        if self.store.is_some() && (self.snapshot_dirty || !self.unsaved.is_empty()) {
            // A failure is logged, kept in `unsaved`/`snapshot_dirty` and shown in the view.
            let _ = self.write_owed(now_ms, |_| Ok(()));
        }
    }

    /// The view at `now_ms` with the next publish number, for a path that publishes a view
    /// outside [`Effects`] (focus, a notification status change).
    pub fn snapshot(&mut self, now_ms: u64) -> (u64, TimerView) {
        self.view_seq += 1;
        let view = self.view(now_ms);
        self.shown_idle = (view.cap_line.clone(), view.offer, view.tip, view.welcome);
        (self.view_seq, view)
    }
}
