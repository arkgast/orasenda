//! What the surfaces see: the view, the clock text and the state read.

use orasenda_core::timer::suggestions::{BreakFor, pick};
use orasenda_core::{
    BreakKind, EngineState, NotificationStatus, Phase, SessionPreset, format_clock,
    format_remaining, spoken_remaining,
};

use super::*;
use crate::api::{ClockTick, Mode, Offer, SuggestionView, TimerState, TimerView};

/// What a `quick` session is called.
/// Two minutes: the warning comes this long before an end.
const WARNING_MS: u64 = 120_000;

const QUICK_NAME: &str = "Just 2 minutes";

impl SessionService {
    /// `timer_state`: a [`SessionService::tick`], plus the drained `pending`.
    pub fn state(&mut self, now_ms: u64) -> (TimerState, Effects) {
        let effects = self.tick(now_ms);
        let state = TimerState {
            view: effects.view.clone(),
            pending: std::mem::take(&mut self.pending),
        };
        self.listening = true;
        (state, effects)
    }

    /// The view at `now_ms`. `mode` is derived here and nowhere else.
    pub fn view(&self, now_ms: u64) -> TimerView {
        let engine = self.engine.view(now_ms);
        let mode = match engine.state {
            EngineState::Idle => Mode::Idle,
            EngineState::Paused => Mode::Paused,
            // The last two minutes of an end longer than that, once the warning has fired.
            EngineState::Running
                if engine.warned
                    && engine.remaining_ms <= WARNING_MS
                    && engine
                        .planned_ms
                        .is_some_and(|planned| planned > WARNING_MS) =>
            {
                Mode::Warning
            }
            EngineState::Running if engine.phase == Phase::Break => Mode::Break,
            EngineState::Running => Mode::Focus,
        };
        let idle = engine.state == EngineState::Idle;
        let running = engine.state == EngineState::Running;
        let (preset_id, preset_name, quick, break_min) = match &engine.preset {
            None => (None, None, false, None),
            Some(SessionPreset::Quick) => (None, Some(QUICK_NAME.to_string()), true, None),
            Some(SessionPreset::Library {
                id,
                name,
                break_min,
                ..
            }) => (
                Some(id.clone()),
                Some(name.clone()),
                false,
                Some(u32::from(*break_min)),
            ),
        };
        TimerView {
            state: engine.state,
            phase: engine.phase,
            mode,
            remaining_ms: engine.remaining_ms,
            remaining: format_remaining(engine.remaining_ms),
            remaining_label: spoken_remaining(engine.remaining_ms),
            progress: engine.progress,
            session_id: engine.session_id.clone(),
            preset_id,
            preset_name,
            quick,
            break_min,
            finish: engine.planned_end_ms.map(|end| self.clock_text(end)),
            planned_min: engine
                .planned_ms
                .map(|ms| u32::try_from(ms.div_ceil(60_000)).unwrap_or(u32::MAX)),
            store: self.store_status,
            notifications: self
                .notifications
                .unwrap_or(NotificationStatus::Unavailable),
            break_kind: engine.break_kind,
            extensions: engine.extensions,
            can_extend: self.can_extend(&engine),
            intent: engine.intent.clone(),
            suggestion: engine.break_kind.map(|kind| self.suggestion(kind, now_ms)),
            offer: (idle && self.offer && !self.settings.auto_continue).then_some(Offer::KeepGoing),
            check_in: (running && engine.auto_step && engine.phase == Phase::Focus).then(|| {
                let finish = engine.planned_end_ms.map(|end| self.clock_text(end));
                format!("Still going · ends {}", finish.unwrap_or_default())
            }),
            cap_line: idle.then(|| self.cap_line(now_ms)).flatten(),
        }
    }

    /// The line for the break running now: the next of today's rotation for its kind.
    fn suggestion(&self, kind: BreakKind, now_ms: u64) -> SuggestionView {
        let kind = match kind {
            BreakKind::Short => BreakFor::Short,
            BreakKind::Long => BreakFor::Long,
        };
        let line = pick(kind, self.breaks_today(kind, now_ms));
        SuggestionView {
            text: line.text.to_owned(),
            label: line.label,
        }
    }

    /// The wall clock, and while idle the finish the chosen preset would have if started now.
    pub fn clock_tick(&self, now_ms: u64) -> ClockTick {
        let idle_finish = if self.engine.is_idle() {
            let focus_ms = u64::from(self.selected().focus_min) * 60_000;
            Some(self.clock_text(now_ms.saturating_add(focus_ms)))
        } else {
            None
        };
        ClockTick {
            epoch_ms: now_ms,
            clock: self.clock_text(now_ms),
            idle_finish,
        }
    }

    fn clock_text(&self, epoch_ms: u64) -> String {
        let local = &self.platform.local_time;
        format_clock(epoch_ms, local.utc_offset_min(epoch_ms), local.hour_cycle())
    }
}
