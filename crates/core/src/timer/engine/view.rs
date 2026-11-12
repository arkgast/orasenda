use super::Session;
use crate::timer::{EngineState, EngineView, Phase};

impl Session {
    /// The numbers the UI layer shows at `now_ms`.
    pub fn view(&self, now_ms: u64) -> EngineView {
        let (state, live) = match self {
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
                    break_kind: None,
                    extensions: 0,
                    intent: None,
                    warned: false,
                    auto_step: false,
                    open_focus: false,
                };
            }
            Session::Running { live } => (EngineState::Running, live),
            Session::Paused { live, .. } => (EngineState::Paused, live),
        };
        let elapsed_ms = self.elapsed_ms(now_ms);
        let planned_ms = live.planned_ms;
        let progress = if planned_ms == 0 {
            1.0
        } else {
            // Precision loss above 2^53 ms (285,000 years) is irrelevant for a fraction.
            (elapsed_ms as f64 / planned_ms as f64).clamp(0.0, 1.0)
        };
        EngineView {
            state,
            phase: live.phase,
            preset: Some(live.preset.clone()),
            session_id: Some(live.id.clone()),
            remaining_ms: planned_ms.saturating_sub(elapsed_ms),
            progress,
            planned_end_ms: self.planned_end_ms(),
            planned_ms: Some(planned_ms),
            break_kind: live.break_kind,
            extensions: live.extensions,
            intent: live.intent.clone(),
            warned: live.warned,
            auto_step: live.auto_step,
            open_focus: live.open_focus.is_some(),
        }
    }

    /// `started + planned + paused_total + gap` while running; `None` while paused (the end
    /// moves with the pause and is known again on resume) or idle.
    pub fn planned_end_ms(&self) -> Option<u64> {
        match self {
            Session::Running { live } => Some(live.planned_end()),
            Session::Idle | Session::Paused { .. } => None,
        }
    }

    pub fn is_idle(&self) -> bool {
        matches!(self, Session::Idle)
    }

    /// The elapsed time of the live phase. While paused the count is taken at the pause, so it
    /// stays frozen even if the clock is set back.
    fn elapsed_ms(&self, now_ms: u64) -> u64 {
        match self {
            Session::Idle => 0,
            Session::Running { live } => live.elapsed_at(now_ms),
            Session::Paused {
                live,
                pause_started_ms,
            } => live.elapsed_at(*pause_started_ms),
        }
    }
}
