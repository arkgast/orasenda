//! The transitions: apply, tick, start, change and end.

use orasenda_core::{Milestone, Phase, SessionId, SessionPreset, SessionRecord, TimerError};

use super::*;
use crate::api::{
    MilestoneEvent, MilestoneKind, StartRequest, TimerCommandError, TimerCommandErrorKind,
};

/// The longest intent, in characters.
const INTENT_MAX_CHARS: usize = 120;

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
        let clears_offer = !matches!(action, Action::DismissOffer);
        let result = match action {
            Action::Start(request) => self
                .start(&request, now_ms, new_id, &mut outcome)
                .map_err(TimerCommandError::from),
            Action::Pause => self
                .engine
                .pause(now_ms)
                .map(|()| self.changed(now_ms, MilestoneKind::Paused, &mut outcome))
                .map_err(TimerCommandError::from),
            Action::Resume => self
                .engine
                .resume(now_ms)
                .map(|()| self.changed(now_ms, MilestoneKind::Resumed, &mut outcome))
                .map_err(TimerCommandError::from),
            Action::Stop => self
                .engine
                .stop(now_ms)
                .map(|records| self.end(records, now_ms, &mut outcome))
                .map_err(TimerCommandError::from),
            Action::Extend => self.extend(now_ms, &mut outcome),
            Action::SetIntent(intent) => self.set_intent(intent, now_ms),
            Action::DismissOffer => {
                self.offer = false;
                Ok(())
            }
            Action::TakeBreak => self.take_break(now_ms, &mut outcome),
        };
        if result.is_ok() && clears_offer {
            self.offer = false;
        }
        self.effects(now_ms, was_idle, outcome, result)
    }

    /// The scheduler's once-a-second step: advance; write an end together with anything
    /// owed, or else retry owed launch reads and then what is owed to the store. At most one
    /// read and one write attempt.
    pub fn tick(&mut self, now_ms: u64) -> Effects {
        let was_idle = self.engine.is_idle();
        let shown = self.shown_idle.clone();
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
        effects.idle_changed = self.shown_idle != shown;
        effects
    }

    /// Advances the engine; on a natural end records it like a stop. True when it ended.
    pub(super) fn advance(&mut self, now_ms: u64, outcome: &mut Outcome) -> bool {
        self.reserve_break_id();
        // The focus a step belongs to, even when the same step goes on into its break.
        let focus_id = self.engine.view(now_ms).session_id;
        let mut ended = false;
        let mut changed = false;
        let mut last_end_ms = now_ms;
        let mut roll_on = None;
        for milestone in self.engine.advance(now_ms, self.auto_longest_ms()) {
            match milestone {
                Milestone::Ended(records) => {
                    last_end_ms = records.first().map_or(now_ms, |r| r.ended_ms.min(now_ms));
                    self.end(records, now_ms, outcome);
                    ended = true;
                }
                Milestone::BreakStarted => {
                    changed = true;
                    self.break_began(focus_id.clone(), now_ms, outcome);
                }
                Milestone::Warned => {
                    changed = true;
                    outcome.warned = true;
                    let phase = self.engine.view(now_ms).phase;
                    let id = self.engine.view(now_ms).session_id;
                    self.event(MilestoneKind::Warned, phase, id, outcome);
                }
                Milestone::Extended => {
                    changed = true;
                    let id = focus_id.clone();
                    self.event(MilestoneKind::Extended, Phase::Focus, id, outcome);
                }
                // Done below, once the session is recorded.
                Milestone::RollOn => roll_on = Some(last_end_ms),
                Milestone::Started | Milestone::Paused | Milestone::Resumed => {}
            }
        }
        if changed && !ended {
            self.persist(now_ms, Vec::new());
        }
        if let Some(at_ms) = roll_on {
            self.roll_on(at_ms, outcome);
        }
        ended
    }

    /// A `quick` session ended with auto-continue on: the saved preset starts at the same
    /// instant, as *Keep going* would.
    fn roll_on(&mut self, at_ms: u64, outcome: &mut Outcome) {
        let id = (self.ids)();
        let request = StartRequest { quick: false };
        if let Err(error) = self.start(&request, at_ms, move || id, outcome) {
            eprintln!("session: the roll-on after a quick session could not start ({error})");
        }
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
        let round = self.round_for(&preset, now_ms);
        self.engine.start(new_id(), preset, round, now_ms)?;
        self.keep_awake = self.begin_keep_awake();
        self.changed(now_ms, MilestoneKind::Started, outcome);
        Ok(())
    }

    /// "+10 min". `WrongState` when it is not on offer (a race with the end, the pause or the
    /// warning), `ExtensionCap` when the cap is used up.
    fn extend(&mut self, now_ms: u64, outcome: &mut Outcome) -> Result<(), TimerCommandError> {
        let engine = self.engine.view(now_ms);
        if !self.extend_offered(&engine) {
            return Err(TimerCommandError::from(TimerError::WrongState));
        }
        if !self.can_extend(&engine) {
            return Err(TimerCommandError {
                kind: TimerCommandErrorKind::ExtensionCap,
                message: "that is all the extra time for this session".into(),
            });
        }
        self.engine
            .extend(now_ms)
            .map_err(TimerCommandError::from)?;
        self.persist(now_ms, Vec::new());
        let id = self.engine.view(now_ms).session_id;
        self.event(MilestoneKind::Extended, Phase::Focus, id, outcome);
        Ok(())
    }

    /// Ends the focus now as completed and starts its break.
    fn take_break(&mut self, now_ms: u64, outcome: &mut Outcome) -> Result<(), TimerCommandError> {
        self.reserve_break_id();
        self.engine.take_break(now_ms).map_err(wrong_state)?;
        self.persist(now_ms, Vec::new());
        let focus_id = self.engine.open_focus().map(|focus| focus.id.clone());
        self.break_began(focus_id, now_ms, outcome);
        Ok(())
    }

    /// A break began: the milestone, and the focus that just completed against the cap.
    fn break_began(&mut self, focus_id: Option<SessionId>, now_ms: u64, outcome: &mut Outcome) {
        outcome.break_started = true;
        self.event(MilestoneKind::BreakStarted, Phase::Break, focus_id, outcome);
        // Absent when the break has also ended in the same step; its `Ended` checks the cap.
        if let Some(focus) = self.engine.open_focus().cloned() {
            self.check_cap(&focus, now_ms, outcome);
        }
    }

    fn set_intent(&mut self, intent: Option<String>, now_ms: u64) -> Result<(), TimerCommandError> {
        let intent = clean_intent(intent.as_deref())?;
        self.engine
            .set_intent(intent, now_ms)
            .map_err(wrong_state)?;
        self.persist(now_ms, Vec::new());
        Ok(())
    }

    /// A start, pause or resume: write the snapshot and add the milestone.
    pub(super) fn changed(&mut self, now_ms: u64, kind: MilestoneKind, outcome: &mut Outcome) {
        self.persist(now_ms, Vec::new());
        let engine = self.engine.view(now_ms);
        self.event(kind, engine.phase, engine.session_id, outcome);
    }

    /// Adds a milestone about a session. Only a `quick` session has none of the cadence's
    /// milestones but `started`, `paused`, `resumed` and its end, so `quick` follows the live one.
    fn event(
        &self,
        kind: MilestoneKind,
        phase: Phase,
        session_id: Option<SessionId>,
        outcome: &mut Outcome,
    ) {
        outcome.milestones.push(MilestoneEvent {
            kind,
            end_reason: None,
            session_id,
            phase,
            quick: self.engine.is_quick(),
        });
    }

    /// A natural end or a stop: write the records, hand out the guard, add the milestone. The
    /// milestone describes the session by its focus (the first record) and how it ended by
    /// its last row; `ended` is that last row, which decides the end notification.
    pub(super) fn end(&mut self, records: Vec<SessionRecord>, now_ms: u64, outcome: &mut Outcome) {
        let (Some(first), Some(last)) = (records.first().cloned(), records.last().cloned()) else {
            return;
        };
        let quick = first.preset == SessionPreset::Quick;
        outcome.milestones.push(MilestoneEvent {
            kind: MilestoneKind::Ended,
            end_reason: Some(last.end_reason),
            session_id: Some(first.id.clone()),
            phase: last.phase,
            quick,
        });
        self.check_cap(&first, now_ms, outcome);
        if quick && last.end_reason == orasenda_core::EndReason::Completed {
            outcome.quick_completed = true;
            self.offer = self.auto_longest_ms().is_none();
        }
        outcome.drop_after_unlock = self.keep_awake.take();
        outcome.ended = Some(last);
        self.persist(now_ms, records);
    }
}

/// An idle engine is a wrong state for the cadence commands, not "nothing running".
fn wrong_state(error: TimerError) -> TimerCommandError {
    TimerCommandError::from(match error {
        TimerError::NothingRunning => TimerError::WrongState,
        other => other,
    })
}

/// The intent as stored: trimmed, inner whitespace collapsed, at most 120 characters; empty
/// means none.
fn clean_intent(intent: Option<&str>) -> Result<Option<String>, TimerCommandError> {
    let words: Vec<&str> = intent.unwrap_or_default().split_whitespace().collect();
    let text = words.join(" ");
    if text.chars().count() > INTENT_MAX_CHARS {
        return Err(TimerCommandError {
            kind: TimerCommandErrorKind::InvalidIntent,
            message: format!("a name can be up to {INTENT_MAX_CHARS} characters"),
        });
    }
    Ok((!text.is_empty()).then_some(text))
}
