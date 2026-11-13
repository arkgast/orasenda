//! Breaks and the end of a session: the focus completing into its break, `take_break` and `stop`.

use super::{Live, Session};
use crate::timer::{BreakKind, EndReason, Milestone, Phase, SessionId, SessionPreset, TimerError};

impl Live {
    /// The id the next break takes: the one the caller reserved, else one derived from this
    /// focus (the engine alone; the service always reserves a UUIDv7). No I/O here.
    pub(crate) fn take_break_id(&mut self) -> SessionId {
        self.break_id
            .take()
            .unwrap_or_else(|| derived_break_id(&self.id, self.extensions))
    }

    /// This focus completes with the given numbers and its break, named `break_id`, starts at
    /// `at_ms`. The break is long when the round is a multiple of the preset's `rounds`.
    pub(crate) fn start_break(
        &mut self,
        break_id: SessionId,
        at_ms: u64,
        focused_ms: u64,
        paused_total_ms: u64,
    ) -> Live {
        let focus = self.focus_record(at_ms, focused_ms, paused_total_ms, EndReason::Completed);
        let rounds = self.preset.rounds().max(1);
        let long = self.round.is_multiple_of(rounds);
        Live {
            id: break_id,
            preset: self.preset.clone(),
            phase: Phase::Break,
            break_kind: Some(if long {
                BreakKind::Long
            } else {
                BreakKind::Short
            }),
            started_ms: at_ms.max(self.started_ms),
            planned_ms: self.preset.break_ms(long),
            paused_total_ms: 0,
            gap_ms: 0,
            extensions: 0,
            round: self.round,
            warned: false,
            auto_step: false,
            open_focus: Some(Box::new(focus)),
            cut_breaks: std::mem::take(&mut self.cut_breaks),
            break_id: None,
        }
    }
}

/// The fallback id when the caller reserved none: derived from the focus's id and extension
/// count, so a break cut by `+10 min` and the one after the longer focus differ.
fn derived_break_id(focus: &SessionId, extensions: u8) -> SessionId {
    SessionId(format!("{}-b{extensions}", focus.0))
}

impl Session {
    /// Ends the focus now as `completed`, with its real focused time, and starts its break
    /// (`take_break`). A paused focus folds the pause into its paused time. Refused in a
    /// break (`WrongState`), for `quick` (no break) and when idle.
    ///
    /// Precondition: the caller calls [`Session::advance`] with the same `now_ms` first.
    pub fn take_break(&mut self, now_ms: u64) -> Result<Milestone, TimerError> {
        let (live, paused_total_ms, at_ms) = match self {
            Session::Idle => return Err(TimerError::NothingRunning),
            Session::Running { live } => {
                let paused = live.paused_total_ms;
                (live, paused, now_ms)
            }
            Session::Paused {
                live,
                pause_started_ms,
            } => {
                let paused = live
                    .paused_total_ms
                    .saturating_add(now_ms.saturating_sub(*pause_started_ms));
                (live, paused, *pause_started_ms)
            }
        };
        if live.phase != Phase::Focus || live.preset == SessionPreset::Quick {
            return Err(TimerError::WrongState);
        }
        let focused_ms = live.elapsed_at(at_ms);
        let break_id = live.take_break_id();
        let break_live = live.start_break(break_id, now_ms, focused_ms, paused_total_ms);
        *self = Session::Running { live: break_live };
        Ok(Milestone::BreakStarted)
    }

    /// Ends the session early and returns its rows, focus first, then any cut breaks, then the
    /// current break:
    /// - in a focus: the focus, `stopped`, with its focused time (pauses and cut breaks
    ///   excluded);
    /// - in a break (*Skip break*): the focus `completed` and the break `stopped`.
    ///
    /// Precondition: the caller calls [`Session::advance`] with the same `now_ms` first.
    pub fn stop(&mut self, now_ms: u64) -> Result<Vec<crate::timer::SessionRecord>, TimerError> {
        let (live, paused_total_ms, at_ms) = match std::mem::take(self) {
            Session::Idle => return Err(TimerError::NothingRunning),
            Session::Running { live } => {
                let paused = live.paused_total_ms;
                (live, paused, now_ms)
            }
            Session::Paused {
                live,
                pause_started_ms,
            } => {
                let paused = live
                    .paused_total_ms
                    .saturating_add(now_ms.saturating_sub(pause_started_ms));
                (live, paused, pause_started_ms)
            }
        };
        let elapsed_ms = live.elapsed_at(at_ms);
        Ok(match live.phase {
            Phase::Focus => {
                let focus =
                    live.focus_record(now_ms, elapsed_ms, paused_total_ms, EndReason::Stopped);
                let mut records = vec![focus];
                records.extend(live.cut_breaks);
                records
            }
            Phase::Break => {
                let brk =
                    live.break_record(now_ms, elapsed_ms, paused_total_ms, EndReason::Stopped);
                live.into_records(brk)
            }
        })
    }
}
