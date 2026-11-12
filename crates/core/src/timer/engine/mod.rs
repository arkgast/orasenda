//! The engine: a focus session as a plain state machine over wall-clock milliseconds.
//!
//! Every method takes `now_ms`; the engine never reads the clock. Arithmetic saturates, so a
//! clock set back, a snapshot from the future or an instant near `u64::MAX` never panics.

use serde::{Deserialize, Serialize};

use super::{EndReason, Phase, Preset, PresetSpec, SessionId, SessionRecord, TimerError};

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
}

mod advance;
mod view;

#[cfg(test)]
mod tests;
