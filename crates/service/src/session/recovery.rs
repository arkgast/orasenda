//! Launch recovery: the reads a failed launch still owes, and the rows they find.

use orasenda_core::{Milestone, Session, SessionRecord};
use orasenda_store::{StoreError, Txn, active_session};

use super::*;
use crate::api::{MilestoneEvent, MilestoneKind, StoreStatus};

/// Launch reads that failed at the database level and are still owed (architect ruling on
/// #91). `tick` retries them, at most one read attempt a tick.
#[derive(Debug, Default, Clone, Copy)]
pub(super) struct RecoverOwed {
    /// The settings were not read; a settings write clears this half.
    pub(super) settings: bool,
    /// The `active_session` row was not read; a write records any session it finds there.
    pub(super) snapshot: bool,
    /// The preset library was not loaded (or not seeded); core's defaults show meanwhile.
    pub(super) presets: bool,
}

impl RecoverOwed {
    pub(super) fn any(self) -> bool {
        self.settings || self.snapshot || self.presets
    }
}

impl SessionService {
    /// Relaunch recovery from a read of `active_session`. True when it wrote (a session that
    /// ended while Orasenda was closed).
    pub(super) fn recover(
        &mut self,
        read: Result<Option<Session>, StoreError>,
        now_ms: u64,
    ) -> bool {
        let mut snapshot = match read {
            Ok(Some(snapshot)) => snapshot,
            Ok(None) => return false,
            // Left in place: a later build may read it, and nothing here can repair it.
            Err(StoreError::Json(error)) => {
                eprintln!("store: the saved session could not be decoded ({error}); starting idle");
                return false;
            }
            Err(error) => {
                eprintln!("store: the saved session could not be read ({error}); retrying");
                self.recover_owed.snapshot = true;
                self.store_status = StoreStatus::Unavailable;
                return false;
            }
        };
        if let Some(records) = ended_records(snapshot.advance(now_ms, None)) {
            if let Some(focus) = records.first() {
                self.pending.push(recovered(focus));
            }
            self.persist(now_ms, records);
            return true;
        }
        self.engine = snapshot;
        if !self.engine.is_idle() {
            self.keep_awake = self.begin_keep_awake();
        }
        false
    }

    /// Retries the owed launch reads in one read transaction. The snapshot is read only
    /// while nothing has happened since launch (engine idle, nothing owed to the store);
    /// otherwise the next write records it. True when recovery wrote.
    pub(super) fn retry_recovery(&mut self, now_ms: u64) -> bool {
        // First: a seed rewrites `timer.preset`, so the settings read below must follow it.
        let seeded = self.recover_owed.presets && self.retry_presets(now_ms);
        let owed = self.recover_owed;
        let want_snapshot = owed.snapshot
            && self.engine.is_idle()
            && !self.snapshot_dirty
            && self.unsaved.is_empty();
        if !owed.settings && !want_snapshot {
            return seeded;
        }
        let Some(store) = &self.store else {
            return seeded;
        };
        let read = store.read(|txn| {
            let settings = if owed.settings {
                Some(read_settings(txn)?)
            } else {
                None
            };
            // A decode error is kept apart: it is not a read failure (see `recover`).
            let snapshot = want_snapshot.then(|| active_session::get::<Session>(txn));
            if let Some(Err(error)) = &snapshot
                && !matches!(error, StoreError::Json(_))
            {
                return Err(error.clone());
            }
            Ok((settings, snapshot))
        });
        // Still failing: already logged when the debt began.
        let Ok((settings, snapshot)) = read else {
            return seeded;
        };
        let mut wrote = seeded;
        if let Some((settings, pending)) = settings {
            let before = self.settings.theme;
            self.settings = settings;
            if self.settings.theme != before {
                self.theme_owed = Some(self.settings.theme);
            }
            self.review_pending = pending;
            self.recover_owed.settings = false;
            self.settings_event_owed = true;
        }
        if let Some(snapshot) = snapshot {
            self.recover_owed.snapshot = false;
            wrote |= self.recover(snapshot, now_ms);
        }
        // After the snapshot is settled: a write while it is still owed would treat the
        // running session as unread. One event, carrying the value after the review.
        if self.review_pending {
            let reviewed = self.run_notify_review(now_ms);
            self.settings_event_owed |= reviewed;
            wrote |= reviewed;
        }
        self.refresh_status();
        wrote
    }

    /// Back to `ok` once nothing is owed to or from the store.
    pub(super) fn refresh_status(&mut self) {
        let owes_nothing =
            !self.recover_owed.any() && !self.snapshot_dirty && self.unsaved.is_empty();
        if owes_nothing && self.store.is_some() {
            self.store_status = StoreStatus::Ok;
        }
    }
}

/// What a write found in an `active_session` row whose launch read failed.
pub(super) enum RowFound {
    Nothing,
    /// The session it held, recorded as ended: `completed` at its planned end if that has
    /// passed, otherwise `stopped` with its focused time (another session may now be live,
    /// so it cannot be restored).
    Ended(Vec<SessionRecord>),
    Undecodable,
}

pub(super) fn unread_row(txn: &Txn, now_ms: u64) -> Result<RowFound, StoreError> {
    let mut session = match active_session::get::<Session>(txn) {
        Ok(Some(session)) => session,
        Ok(None) => return Ok(RowFound::Nothing),
        Err(StoreError::Json(error)) => {
            eprintln!("store: the saved session could not be decoded ({error}); leaving it");
            return Ok(RowFound::Undecodable);
        }
        Err(error) => return Err(error),
    };
    if let Some(records) = ended_records(session.advance(now_ms, None)) {
        return Ok(RowFound::Ended(records));
    }
    // An idle snapshot has nothing to record.
    Ok(session
        .stop(now_ms)
        .map_or(RowFound::Nothing, RowFound::Ended))
}

/// The `recovered` milestone for a session that ended while Orasenda was closed.
pub(super) fn recovered(record: &SessionRecord) -> MilestoneEvent {
    MilestoneEvent {
        kind: MilestoneKind::Recovered,
        end_reason: Some(record.end_reason),
        session_id: Some(record.id.clone()),
    }
}

/// The records of the `Ended` milestone among `milestones`, if the session ended.
fn ended_records(milestones: Vec<Milestone>) -> Option<Vec<SessionRecord>> {
    milestones.into_iter().find_map(|m| match m {
        Milestone::Ended(records) => Some(records),
        _ => None,
    })
}
