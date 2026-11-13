//! The engine: a focus session and its break as a plain state machine over wall-clock
//! milliseconds.
//!
//! Every method takes `now_ms`; the engine never reads the clock. Arithmetic saturates, so a
//! clock set back, a snapshot from the future or an instant near `u64::MAX` never panics.
//!
//! Layout: this file holds the state and the plain transitions (start, pause, resume);
//! `advance` the clock-driven ones, `breaks` the break and the end of a session, `extend` the
//! `+10 min` actions, `auto` the automatic steps and `view` the numbers for the surfaces.

use serde::{Deserialize, Serialize};

use super::{BreakKind, Phase, SessionId, SessionPreset, SessionRecord, TimerError};

/// Ten minutes: one extension, manual or automatic.
pub(crate) const EXTENSION_MS: u64 = 600_000;
/// The two-minute warning comes this long before an end.
pub(crate) const WARNING_MS: u64 = 120_000;

/// The live phase of a session: its focus, or the break that follows it.
///
/// In a break the fields describe the break; the finished focus waits in `open_focus` (it can
/// still be extended), and `cut_breaks` holds the breaks already cut short by `+10 min`. Both
/// are written when the session ends.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Live {
    pub(crate) id: SessionId,
    pub(crate) preset: SessionPreset,
    pub(crate) phase: Phase,
    pub(crate) break_kind: Option<BreakKind>,
    pub(crate) started_ms: u64,
    /// The phase's planned length; grows by ten minutes per extension.
    pub(crate) planned_ms: u64,
    pub(crate) paused_total_ms: u64,
    /// Time spent in breaks cut short by `+10 min`, excluded from the focus (focus only).
    pub(crate) gap_ms: u64,
    pub(crate) extensions: u8,
    /// Fixed at start; decides which break comes.
    pub(crate) round: u8,
    pub(crate) warned: bool,
    pub(crate) auto_step: bool,
    pub(crate) open_focus: Option<Box<SessionRecord>>,
    pub(crate) cut_breaks: Vec<SessionRecord>,
    /// The id the next break takes, reserved by the caller (see [`Session::reserve_break_id`]).
    /// Kept in the snapshot so a restored session writes the same id.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) break_id: Option<SessionId>,
}

/// The live session. Ending is not a state: [`Session::advance`] and [`Session::stop`] return
/// the records and leave the engine [`Session::Idle`]. Serialized as the
/// `active_session.snapshot` JSON, tagged by `"state"`.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum Session {
    #[default]
    Idle,
    Running {
        #[serde(flatten)]
        live: Live,
    },
    Paused {
        #[serde(flatten)]
        live: Live,
        pause_started_ms: u64,
    },
}

impl Session {
    /// Starts a focus session of `preset.focus_ms()` as round `round`. Refused with
    /// `AlreadyRunning` unless idle.
    pub fn start(
        &mut self,
        id: SessionId,
        preset: SessionPreset,
        round: u8,
        now_ms: u64,
    ) -> Result<(), TimerError> {
        match self {
            Session::Idle => {
                *self = Session::Running {
                    live: Live {
                        id,
                        planned_ms: preset.focus_ms(),
                        preset,
                        phase: Phase::Focus,
                        break_kind: None,
                        started_ms: now_ms,
                        paused_total_ms: 0,
                        gap_ms: 0,
                        extensions: 0,
                        round,
                        warned: false,
                        auto_step: false,
                        open_focus: None,
                        cut_breaks: Vec::new(),
                        break_id: None,
                    },
                };
                Ok(())
            }
            Session::Running { .. } | Session::Paused { .. } => Err(TimerError::AlreadyRunning),
        }
    }

    /// Pauses a running session (a focus or a break); `elapsed` stops moving until
    /// [`Session::resume`].
    ///
    /// Precondition: the caller calls [`Session::advance`] with the same `now_ms` first. This
    /// method does not check the planned end itself, so a session already past it would be
    /// treated as still counting (the service runs advance-then-act on every command).
    pub fn pause(&mut self, now_ms: u64) -> Result<(), TimerError> {
        match std::mem::take(self) {
            Session::Idle => Err(TimerError::NothingRunning),
            paused @ Session::Paused { .. } => {
                *self = paused;
                Err(TimerError::WrongState)
            }
            Session::Running { live } => {
                *self = Session::Paused {
                    live,
                    pause_started_ms: now_ms,
                };
                Ok(())
            }
        }
    }

    /// Resumes a paused session, adding the pause to `paused_total_ms` (which moves the planned
    /// end). A clock set back during the pause adds nothing.
    ///
    /// Precondition: as for [`Session::pause`].
    pub fn resume(&mut self, now_ms: u64) -> Result<(), TimerError> {
        match std::mem::take(self) {
            Session::Idle => Err(TimerError::NothingRunning),
            running @ Session::Running { .. } => {
                *self = running;
                Err(TimerError::WrongState)
            }
            Session::Paused {
                mut live,
                pause_started_ms,
            } => {
                live.paused_total_ms = live
                    .paused_total_ms
                    .saturating_add(now_ms.saturating_sub(pause_started_ms));
                *self = Session::Running { live };
                Ok(())
            }
        }
    }

    /// Whether a focus that can have a break has no id reserved for it yet.
    pub fn needs_break_id(&self) -> bool {
        match self {
            Session::Idle => false,
            Session::Running { live } | Session::Paused { live, .. } => {
                live.phase == Phase::Focus
                    && live.preset != SessionPreset::Quick
                    && live.break_id.is_none()
            }
        }
    }

    /// Reserves the id the next break takes: a UUIDv7 made by the caller, which owns the id
    /// source (ADR-002). Call it, when [`Session::needs_break_id`], before every
    /// [`Session::advance`] and [`Session::take_break`] that may start a break. It keeps an id
    /// already reserved, and does nothing in a break or when idle. Without a reserved id the
    /// break falls back to an id derived from its focus's, which callers never rely on.
    pub fn reserve_break_id(&mut self, id: SessionId) {
        if let Session::Running { live } | Session::Paused { live, .. } = self
            && live.phase == Phase::Focus
            && live.break_id.is_none()
        {
            live.break_id = Some(id);
        }
    }
}

mod advance;
mod auto;
mod breaks;
mod extend;
mod view;

#[cfg(test)]
mod tests;
