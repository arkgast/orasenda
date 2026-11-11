//! The engine: a focus session as a plain state machine over wall-clock milliseconds.
//!
//! Every method takes `now_ms`; the engine never reads the clock. Arithmetic saturates, so a
//! clock set back, a snapshot from the future or an instant near `u64::MAX` never panics.

use serde::{Deserialize, Serialize};

use super::{
    EndReason, EngineState, EngineView, Milestone, Phase, Preset, PresetSpec, SessionId,
    SessionRecord, TimerError,
};

/// The live session. Ending is not a state: [`Session::advance`] and [`Session::stop`] return
/// the [`SessionRecord`] and leave the engine [`Session::Idle`]. Serialized as the
/// `active_session.snapshot` JSON, tagged by `"state"`.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum Session {
    #[default]
    Idle,
    Running {
        id: SessionId,
        preset: Preset,
        spec: PresetSpec,
        phase: Phase,
        started_ms: u64,
        planned_ms: u64,
        paused_total_ms: u64,
    },
    Paused {
        id: SessionId,
        preset: Preset,
        spec: PresetSpec,
        phase: Phase,
        started_ms: u64,
        planned_ms: u64,
        paused_total_ms: u64,
        pause_started_ms: u64,
    },
}

impl Session {
    /// Starts a focus session of `spec.focus_ms`. Refused with `AlreadyRunning` unless idle.
    pub fn start(
        &mut self,
        id: SessionId,
        preset: Preset,
        spec: PresetSpec,
        now_ms: u64,
    ) -> Result<(), TimerError> {
        match self {
            Session::Idle => {
                let planned_ms = spec.focus_ms;
                *self = Session::Running {
                    id,
                    preset,
                    spec,
                    phase: Phase::Focus,
                    started_ms: now_ms,
                    planned_ms,
                    paused_total_ms: 0,
                };
                Ok(())
            }
            Session::Running { .. } | Session::Paused { .. } => Err(TimerError::AlreadyRunning),
        }
    }

    /// Pauses a running session; `elapsed` stops moving until [`Session::resume`].
    ///
    /// Precondition: the caller calls [`Session::advance`] with the same `now_ms` first. This
    /// method does not check the planned end itself, so a session already past it would be
    /// treated as still counting. T7's session service runs advance-then-act on every command
    /// (the plan's threading and scheduler notes).
    pub fn pause(&mut self, now_ms: u64) -> Result<(), TimerError> {
        match self {
            Session::Idle => Err(TimerError::NothingRunning),
            Session::Paused { .. } => Err(TimerError::WrongState),
            Session::Running {
                id,
                preset,
                spec,
                phase,
                started_ms,
                planned_ms,
                paused_total_ms,
            } => {
                *self = Session::Paused {
                    id: id.clone(),
                    preset: *preset,
                    spec: spec.clone(),
                    phase: *phase,
                    started_ms: *started_ms,
                    planned_ms: *planned_ms,
                    paused_total_ms: *paused_total_ms,
                    pause_started_ms: now_ms,
                };
                Ok(())
            }
        }
    }

    /// Resumes a paused session, adding the pause to `paused_total_ms` (which moves the planned
    /// end). A clock set back during the pause adds nothing.
    ///
    /// Precondition: the caller calls [`Session::advance`] with the same `now_ms` first. This
    /// method does not check the planned end itself, so a session already past it would be
    /// treated as still counting. T7's session service runs advance-then-act on every command
    /// (the plan's threading and scheduler notes).
    pub fn resume(&mut self, now_ms: u64) -> Result<(), TimerError> {
        match self {
            Session::Idle => Err(TimerError::NothingRunning),
            Session::Running { .. } => Err(TimerError::WrongState),
            Session::Paused {
                id,
                preset,
                spec,
                phase,
                started_ms,
                planned_ms,
                paused_total_ms,
                pause_started_ms,
            } => {
                let paused_total_ms =
                    paused_total_ms.saturating_add(now_ms.saturating_sub(*pause_started_ms));
                *self = Session::Running {
                    id: id.clone(),
                    preset: *preset,
                    spec: spec.clone(),
                    phase: *phase,
                    started_ms: *started_ms,
                    planned_ms: *planned_ms,
                    paused_total_ms,
                };
                Ok(())
            }
        }
    }

    /// Ends the session early. The record carries the focused time at `now_ms` (pauses
    /// excluded), `end_reason: Stopped`, and ends at `now_ms` but never before its start.
    ///
    /// Precondition: the caller calls [`Session::advance`] with the same `now_ms` first. This
    /// method does not check the planned end itself, so a session already past it would be
    /// treated as still counting. T7's session service runs advance-then-act on every command
    /// (the plan's threading and scheduler notes).
    pub fn stop(&mut self, now_ms: u64) -> Result<SessionRecord, TimerError> {
        let (id, preset, phase, started_ms, planned_ms, paused_total_ms) = match self {
            Session::Idle => return Err(TimerError::NothingRunning),
            Session::Running {
                id,
                preset,
                phase,
                started_ms,
                planned_ms,
                paused_total_ms,
                ..
            } => (id, preset, phase, started_ms, planned_ms, *paused_total_ms),
            Session::Paused {
                id,
                preset,
                phase,
                started_ms,
                planned_ms,
                paused_total_ms,
                pause_started_ms,
                ..
            } => (
                id,
                preset,
                phase,
                started_ms,
                planned_ms,
                paused_total_ms.saturating_add(now_ms.saturating_sub(*pause_started_ms)),
            ),
        };
        let record = SessionRecord {
            id: id.clone(),
            preset: *preset,
            phase: *phase,
            planned_ms: *planned_ms,
            started_ms: *started_ms,
            ended_ms: now_ms.max(*started_ms),
            paused_total_ms,
            focused_ms: self.elapsed_ms(now_ms),
            end_reason: EndReason::Stopped,
            extensions: 0,
        };
        *self = Session::Idle;
        Ok(record)
    }

    /// Ends a running session once `now_ms` reaches its planned end, returning
    /// `Some(Ended(record))` with `ended_ms` at the planned end, however late the call. `None`
    /// on every other tick, and always while paused or idle.
    ///
    /// Invariant: once this returns `Ended`, the engine is [`Session::Idle`], and `Idle` has no
    /// end time to compare against, so a later call with an earlier `now_ms` (a clock set
    /// back) can never revive the session, change its remaining time or end it again. Only
    /// [`Session::start`] leaves `Idle`.
    pub fn advance(&mut self, now_ms: u64) -> Option<Milestone> {
        let Session::Running {
            id,
            preset,
            phase,
            started_ms,
            planned_ms,
            paused_total_ms,
            ..
        } = self
        else {
            return None;
        };
        let planned_end = planned_end(*started_ms, *planned_ms, *paused_total_ms);
        if now_ms < planned_end {
            return None;
        }
        let record = SessionRecord {
            id: id.clone(),
            preset: *preset,
            phase: *phase,
            planned_ms: *planned_ms,
            started_ms: *started_ms,
            ended_ms: planned_end,
            paused_total_ms: *paused_total_ms,
            focused_ms: *planned_ms,
            end_reason: EndReason::Completed,
            extensions: 0,
        };
        *self = Session::Idle;
        Some(Milestone::Ended(record))
    }

    /// The numbers the UI layer shows at `now_ms`.
    pub fn view(&self, now_ms: u64) -> EngineView {
        let (state, preset, session_id, planned_ms) = match self {
            Session::Idle => {
                return EngineView {
                    state: EngineState::Idle,
                    phase: Phase::Focus,
                    preset: None,
                    session_id: None,
                    remaining_ms: 0,
                    progress: 0.0,
                    planned_end_ms: None,
                };
            }
            Session::Running {
                id,
                preset,
                planned_ms,
                ..
            } => (EngineState::Running, preset, id, *planned_ms),
            Session::Paused {
                id,
                preset,
                planned_ms,
                ..
            } => (EngineState::Paused, preset, id, *planned_ms),
        };
        let elapsed_ms = self.elapsed_ms(now_ms);
        let progress = if planned_ms == 0 {
            1.0
        } else {
            // Precision loss above 2^53 ms (285,000 years) is irrelevant for a fraction.
            (elapsed_ms as f64 / planned_ms as f64).clamp(0.0, 1.0)
        };
        EngineView {
            state,
            phase: self.phase(),
            preset: Some(*preset),
            session_id: Some(session_id.clone()),
            remaining_ms: planned_ms.saturating_sub(elapsed_ms),
            progress,
            planned_end_ms: self.planned_end_ms(),
        }
    }

    /// `started + planned + paused_total` while running; `None` while paused (the end moves
    /// with the pause and is known again on resume) or idle.
    pub fn planned_end_ms(&self) -> Option<u64> {
        match self {
            Session::Running {
                started_ms,
                planned_ms,
                paused_total_ms,
                ..
            } => Some(planned_end(*started_ms, *planned_ms, *paused_total_ms)),
            Session::Idle | Session::Paused { .. } => None,
        }
    }

    pub fn is_idle(&self) -> bool {
        matches!(self, Session::Idle)
    }

    fn phase(&self) -> Phase {
        match self {
            Session::Idle => Phase::Focus,
            Session::Running { phase, .. } | Session::Paused { phase, .. } => *phase,
        }
    }

    /// `clamp(now − started − paused_total − current_pause, 0, planned)`. While paused the
    /// count is taken at the pause, so it stays frozen even if the clock is set back.
    fn elapsed_ms(&self, now_ms: u64) -> u64 {
        let (started_ms, planned_ms, paused_total_ms, at_ms) = match self {
            Session::Idle => return 0,
            Session::Running {
                started_ms,
                planned_ms,
                paused_total_ms,
                ..
            } => (*started_ms, *planned_ms, *paused_total_ms, now_ms),
            Session::Paused {
                started_ms,
                planned_ms,
                paused_total_ms,
                pause_started_ms,
                ..
            } => (
                *started_ms,
                *planned_ms,
                *paused_total_ms,
                *pause_started_ms,
            ),
        };
        at_ms
            .saturating_sub(started_ms)
            .saturating_sub(paused_total_ms)
            .min(planned_ms)
    }
}

fn planned_end(started_ms: u64, planned_ms: u64, paused_total_ms: u64) -> u64 {
    started_ms
        .saturating_add(planned_ms)
        .saturating_add(paused_total_ms)
}

#[cfg(test)]
mod tests;
