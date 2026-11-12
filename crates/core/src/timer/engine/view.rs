use super::Session;
use super::advance::planned_end;
use crate::timer::{EngineState, EngineView, Phase};

impl Session {
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
                    planned_ms: None,
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
            planned_ms: Some(planned_ms),
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
}
