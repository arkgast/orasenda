//! The transitions: apply, tick, start, change and end.

use orasenda_core::{Milestone, SessionId, SessionPreset, SessionRecord, TimerError};

use super::*;
use crate::api::{MilestoneEvent, MilestoneKind, StartRequest, TimerCommandError};

impl SessionService {
    /// Advances first (a command after the planned end completes the session), then acts
    /// on the engine. Always returns [`Effects`]; the command's outcome is `result`.
    pub fn apply(
        &mut self,
        action: Action,
        now_ms: u64,
        new_id: impl FnOnce() -> SessionId,
    ) -> Effects {
        let was_idle = self.engine.is_idle();
        let mut outcome = Outcome::default();
        self.advance(now_ms, &mut outcome);
        let result = match action {
            Action::Start(request) => self.start(&request, now_ms, new_id, &mut outcome),
            Action::Pause => self.engine.pause(now_ms).map(|()| {
                self.changed(now_ms, MilestoneKind::Paused, &mut outcome);
            }),
            Action::Resume => self.engine.resume(now_ms).map(|()| {
                self.changed(now_ms, MilestoneKind::Resumed, &mut outcome);
            }),
            Action::Stop => self.engine.stop(now_ms).map(|records| {
                self.end(records, now_ms, &mut outcome);
            }),
        };
        self.effects(
            now_ms,
            was_idle,
            outcome,
            result.map_err(TimerCommandError::from),
        )
    }

    /// The scheduler's once-a-second step: advance; write an end together with anything
    /// owed, or else retry owed launch reads and then what is owed to the store. At most one
    /// read and one write attempt.
    pub fn tick(&mut self, now_ms: u64) -> Effects {
        let was_idle = self.engine.is_idle();
        let mut outcome = Outcome::default();
        let mut store_changed = false;
        if !self.advance(now_ms, &mut outcome) {
            let before = self.store_status;
            if !self.retry_recovery(now_ms) {
                self.flush(now_ms);
            }
            store_changed = self.store_status != before;
        }
        let mut effects = self.effects(now_ms, was_idle, outcome, Ok(()));
        effects.store_changed = store_changed;
        effects
    }

    /// Advances the engine; on a natural end records it like a stop. True when it ended.
    /// Until the cadence service lands a break shows as a focus and `auto` is off.
    pub(super) fn advance(&mut self, now_ms: u64, outcome: &mut Outcome) -> bool {
        let mut ended = false;
        let mut changed = false;
        for milestone in self.engine.advance(now_ms, None) {
            match milestone {
                Milestone::Ended(records) => {
                    self.end(records, now_ms, outcome);
                    ended = true;
                }
                // The engine moved on (a break began, a warning fired): write the snapshot.
                Milestone::BreakStarted | Milestone::Warned | Milestone::Extended => changed = true,
                Milestone::Started | Milestone::Paused | Milestone::Resumed | Milestone::RollOn => {
                }
            }
        }
        if changed && !ended {
            self.persist(now_ms, Vec::new());
        }
        ended
    }

    pub(super) fn start(
        &mut self,
        request: &StartRequest,
        now_ms: u64,
        new_id: impl FnOnce() -> SessionId,
        outcome: &mut Outcome,
    ) -> Result<(), TimerError> {
        if !self.engine.is_idle() {
            return Err(TimerError::AlreadyRunning);
        }
        // The selected preset as the library has it now; the session keeps this snapshot.
        let preset = if request.quick {
            SessionPreset::Quick
        } else {
            snapshot_of(self.selected())
        };
        // The round comes from today's rows once the cadence service lands; until then it is 1.
        self.engine.start(new_id(), preset, 1, now_ms)?;
        self.keep_awake = self.begin_keep_awake();
        self.changed(now_ms, MilestoneKind::Started, outcome);
        Ok(())
    }

    /// A start, pause or resume: write the snapshot and add the milestone.
    pub(super) fn changed(&mut self, now_ms: u64, kind: MilestoneKind, outcome: &mut Outcome) {
        self.persist(now_ms, Vec::new());
        outcome.milestones.push(MilestoneEvent {
            kind,
            end_reason: None,
            session_id: self.engine.view(now_ms).session_id,
        });
    }

    /// A natural end or a stop: write the records, hand out the guard, add the milestone. The
    /// milestone and `ended` describe the focus, the first record.
    pub(super) fn end(&mut self, records: Vec<SessionRecord>, now_ms: u64, outcome: &mut Outcome) {
        let Some(focus) = records.first().cloned() else {
            return;
        };
        outcome.milestones.push(MilestoneEvent {
            kind: MilestoneKind::Ended,
            end_reason: Some(focus.end_reason),
            session_id: Some(focus.id.clone()),
        });
        outcome.drop_after_unlock = self.keep_awake.take();
        outcome.ended = Some(focus);
        self.persist(now_ms, records);
    }
}
