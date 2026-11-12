//! The `+10 min` action: from the last two minutes of a focus, or from a break.

use super::{EXTENSION_MS, Live, Session, WARNING_MS};
use crate::timer::{EndReason, Milestone, Phase, SessionPreset, TimerError};

impl Session {
    /// Adds ten minutes.
    /// - In a running focus with at most two minutes left: `planned += 10 min`, `extensions +=
    ///   1`, and the warning comes again before the new end.
    /// - In a running break: the break is recorded as `stopped` with its real length, and the
    ///   focus continues (same id, intent and round) with ten more minutes. The cut break is
    ///   kept with the session and written with it; the time in it is excluded from the focus.
    ///
    /// Refused while paused (`WrongState`: the action is hidden and returns on resume), for
    /// `quick`, and in a focus with more than two minutes left. The cap is the service's.
    ///
    /// Precondition: the caller calls [`Session::advance`] with the same `now_ms` first.
    pub fn extend(&mut self, now_ms: u64) -> Result<Milestone, TimerError> {
        let live = match self {
            Session::Idle => return Err(TimerError::NothingRunning),
            Session::Paused { .. } => return Err(TimerError::WrongState),
            Session::Running { live } => live,
        };
        match live.phase {
            Phase::Focus => {
                let remaining = live.planned_end().saturating_sub(now_ms);
                if live.preset == SessionPreset::Quick || remaining > WARNING_MS {
                    return Err(TimerError::WrongState);
                }
                live.planned_ms = live.planned_ms.saturating_add(EXTENSION_MS);
                live.extensions = live.extensions.saturating_add(1);
                live.warned = false;
                Ok(Milestone::Extended)
            }
            Phase::Break => {
                let resumed = live.back_to_focus(now_ms).ok_or(TimerError::WrongState)?;
                *self = Session::Running { live: resumed };
                Ok(Milestone::Extended)
            }
        }
    }
}

impl Live {
    /// This break, cut short at `now_ms`, turned back into its focus with ten more minutes.
    /// `None` when there is no open focus to return to.
    fn back_to_focus(&mut self, now_ms: u64) -> Option<Live> {
        let focus = *self.open_focus.take()?;
        let cut = self.break_record(
            now_ms,
            self.elapsed_at(now_ms),
            self.paused_total_ms,
            EndReason::Stopped,
        );
        // Earlier cuts, plus this break's whole span, are time the focus did not run.
        let earlier_gap = focus
            .ended_ms
            .saturating_sub(focus.started_ms)
            .saturating_sub(focus.focused_ms)
            .saturating_sub(focus.paused_total_ms);
        let gap_ms = earlier_gap.saturating_add(cut.ended_ms.saturating_sub(cut.started_ms));
        let mut cut_breaks = std::mem::take(&mut self.cut_breaks);
        cut_breaks.push(cut);
        Some(Live {
            id: focus.id,
            preset: focus.preset,
            phase: Phase::Focus,
            break_kind: None,
            started_ms: focus.started_ms,
            // Ten minutes from now, whether the focus had run its whole plan or was cut short.
            planned_ms: focus.focused_ms.saturating_add(EXTENSION_MS),
            paused_total_ms: focus.paused_total_ms,
            gap_ms,
            extensions: focus.extensions.saturating_add(1),
            round: self.round,
            intent: focus.intent,
            warned: false,
            auto_step: false,
            open_focus: None,
            cut_breaks,
            break_id: None,
        })
    }
}
