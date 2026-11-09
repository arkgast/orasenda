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
mod tests {
    use super::*;
    use crate::timer::{CustomSpec, QUICK_START_MS};

    const S: u64 = 1_000;
    const MIN: u64 = 60 * S;
    const T0: u64 = 1_794_237_600_000;

    fn id(s: &str) -> SessionId {
        SessionId(s.into())
    }

    fn spec(p: Preset) -> PresetSpec {
        p.spec(&CustomSpec::default()).unwrap()
    }

    fn classic_at(now: u64) -> Session {
        let mut s = Session::default();
        s.start(id("a"), Preset::Classic, spec(Preset::Classic), now)
            .unwrap();
        s
    }

    fn ended(m: Option<Milestone>) -> SessionRecord {
        match m {
            Some(Milestone::Ended(r)) => r,
            other => panic!("expected Ended, got {other:?}"),
        }
    }

    #[test]
    fn default_is_idle() {
        assert_eq!(Session::default(), Session::Idle);
        assert!(Session::default().is_idle());
        assert!(!classic_at(T0).is_idle());
        let v = Session::Idle.view(T0);
        assert_eq!(v.state, EngineState::Idle);
        assert_eq!(v.preset, None);
        assert_eq!(v.session_id, None);
        assert_eq!(v.remaining_ms, 0);
        assert_eq!(v.progress, 0.0);
        assert_eq!(v.planned_end_ms, None);
    }

    #[test]
    fn start_pause_resume_stop_arithmetic() {
        let mut s = classic_at(T0);
        let v = s.view(T0);
        assert_eq!(v.state, EngineState::Running);
        assert_eq!(v.phase, Phase::Focus);
        assert_eq!(v.preset, Some(Preset::Classic));
        assert_eq!(v.session_id, Some(id("a")));
        assert_eq!(v.remaining_ms, 25 * MIN);
        assert_eq!(v.progress, 0.0);

        // 5 minutes in, pause for 3 minutes, then 2 more minutes.
        assert_eq!(s.view(T0 + 5 * MIN).remaining_ms, 20 * MIN);
        s.pause(T0 + 5 * MIN).unwrap();
        assert_eq!(s.view(T0 + 6 * MIN).state, EngineState::Paused);
        s.resume(T0 + 8 * MIN).unwrap();
        assert_eq!(s.view(T0 + 8 * MIN).remaining_ms, 20 * MIN);
        let v = s.view(T0 + 10 * MIN);
        assert_eq!(v.remaining_ms, 18 * MIN);
        assert_eq!(v.progress, 7.0 / 25.0);

        let r = s.stop(T0 + 10 * MIN).unwrap();
        assert_eq!(r.id, id("a"));
        assert_eq!(r.preset, Preset::Classic);
        assert_eq!(r.phase, Phase::Focus);
        assert_eq!(r.planned_ms, 25 * MIN);
        assert_eq!(r.started_ms, T0);
        assert_eq!(r.ended_ms, T0 + 10 * MIN);
        assert_eq!(r.paused_total_ms, 3 * MIN);
        assert_eq!(r.focused_ms, 7 * MIN);
        assert_eq!(r.end_reason, EndReason::Stopped);
        assert_eq!(r.extensions, 0);
        assert!(s.is_idle());
    }

    #[test]
    fn elapsed_is_frozen_while_paused() {
        let mut s = classic_at(T0);
        s.pause(T0 + 10 * MIN).unwrap();
        for later in [
            T0 + 10 * MIN,
            T0 + 11 * MIN,
            T0 + 60 * MIN,
            T0 + 48 * 60 * MIN,
        ] {
            let v = s.view(later);
            assert_eq!(v.remaining_ms, 15 * MIN, "at {later}");
            assert_eq!(v.progress, 10.0 / 25.0);
        }
        // A clock set back while paused does not move it either.
        assert_eq!(s.view(T0).remaining_ms, 15 * MIN);
    }

    #[test]
    fn planned_end_is_some_running_none_paused_and_moves_by_the_pause() {
        let mut s = classic_at(T0);
        assert_eq!(s.planned_end_ms(), Some(T0 + 25 * MIN));
        assert_eq!(s.view(T0).planned_end_ms, Some(T0 + 25 * MIN));
        s.pause(T0 + 5 * MIN).unwrap();
        assert_eq!(s.planned_end_ms(), None);
        assert_eq!(s.view(T0 + 6 * MIN).planned_end_ms, None);
        s.resume(T0 + 9 * MIN).unwrap();
        assert_eq!(s.planned_end_ms(), Some(T0 + 29 * MIN));
        s.pause(T0 + 10 * MIN).unwrap();
        s.resume(T0 + 11 * MIN).unwrap();
        assert_eq!(s.planned_end_ms(), Some(T0 + 30 * MIN));
        assert_eq!(s.view(T0 + 11 * MIN).planned_end_ms, Some(T0 + 30 * MIN));
        assert_eq!(Session::Idle.planned_end_ms(), None);
    }

    #[test]
    fn late_advance_ends_at_planned_end_not_now() {
        let mut s = classic_at(T0);
        s.pause(T0 + MIN).unwrap();
        s.resume(T0 + 3 * MIN).unwrap();
        let planned_end = T0 + 27 * MIN;
        assert_eq!(s.advance(planned_end - 1), None);
        let r = ended(s.advance(planned_end + 7 * 60 * MIN));
        assert_eq!(r.ended_ms, planned_end);
        assert_eq!(r.focused_ms, 25 * MIN);
        assert_eq!(r.planned_ms, 25 * MIN);
        assert_eq!(r.paused_total_ms, 2 * MIN);
        assert_eq!(r.end_reason, EndReason::Completed);
        assert_eq!(r.extensions, 0);
        assert!(s.is_idle());

        // Exactly at the planned end also ends.
        let mut s = classic_at(T0);
        assert_eq!(ended(s.advance(T0 + 25 * MIN)).ended_ms, T0 + 25 * MIN);
    }

    #[test]
    fn advance_on_paused_never_ends() {
        let mut s = classic_at(T0);
        s.pause(T0 + MIN).unwrap();
        let before = s.clone();
        for later in [T0 + 25 * MIN, T0 + 365 * 24 * 60 * MIN, u64::MAX] {
            assert_eq!(s.advance(later), None);
        }
        assert_eq!(s, before);
    }

    #[test]
    fn advance_on_idle_is_none() {
        let mut s = Session::Idle;
        assert_eq!(s.advance(T0), None);
        assert_eq!(s.advance(u64::MAX), None);
        assert!(s.is_idle());
    }

    #[test]
    fn record_carries_the_preset_given_to_start() {
        let custom = CustomSpec {
            focus_min: 30,
            break_min: 7,
        };
        for (preset, sp) in [
            (Preset::Quick, spec(Preset::Quick)),
            (Preset::Classic, spec(Preset::Classic)),
            (Preset::Custom, Preset::Custom.spec(&custom).unwrap()),
        ] {
            let planned = sp.focus_ms;
            let mut s = Session::Idle;
            s.start(id("p"), preset, sp, T0).unwrap();
            let r = ended(s.advance(T0 + planned));
            assert_eq!(r.preset, preset);
            assert_eq!(r.planned_ms, planned);
            assert_eq!(r.focused_ms, planned);
        }
        let mut s = Session::Idle;
        s.start(id("q"), Preset::Quick, spec(Preset::Quick), T0)
            .unwrap();
        assert_eq!(s.view(T0).remaining_ms, QUICK_START_MS);
        assert_eq!(s.stop(T0 + MIN).unwrap().preset, Preset::Quick);
    }

    #[test]
    fn elapsed_clamped_on_backward_clock_never_negative() {
        let mut s = classic_at(T0);
        // Clock set back before the start.
        let v = s.view(T0 - 10 * MIN);
        assert_eq!(v.remaining_ms, 25 * MIN);
        assert_eq!(v.progress, 0.0);
        assert_eq!(s.view(0).remaining_ms, 25 * MIN);
        assert_eq!(s.advance(0), None);
        // Remaining grows by the jump back.
        assert_eq!(s.view(T0 + 10 * MIN).remaining_ms, 15 * MIN);
        assert_eq!(s.view(T0 + 4 * MIN).remaining_ms, 21 * MIN);
        // Pause, then resume at an earlier instant: the pause adds nothing.
        s.pause(T0 + 10 * MIN).unwrap();
        s.resume(T0 + 2 * MIN).unwrap();
        assert_eq!(s.planned_end_ms(), Some(T0 + 25 * MIN));
        // Stop before the start: no focused time, and the record never ends before it starts.
        let r = s.stop(T0 - MIN).unwrap();
        assert_eq!(r.focused_ms, 0);
        assert!(r.ended_ms >= r.started_ms);
    }

    #[test]
    fn adversarial_instants_never_panic() {
        // A restored snapshot that starts in the future, and instants near u64::MAX.
        let mut s = classic_at(u64::MAX - MIN);
        assert_eq!(s.planned_end_ms(), Some(u64::MAX));
        assert_eq!(s.view(0).remaining_ms, 25 * MIN);
        s.pause(u64::MAX).unwrap();
        s.resume(0).unwrap();
        s.pause(0).unwrap();
        s.resume(u64::MAX).unwrap();
        assert!(s.view(u64::MAX).progress <= 1.0);
        let _ = s.advance(u64::MAX);
        let mut s = Session::Paused {
            id: id("x"),
            preset: Preset::Classic,
            spec: spec(Preset::Classic),
            phase: Phase::Focus,
            started_ms: u64::MAX,
            planned_ms: u64::MAX,
            paused_total_ms: u64::MAX,
            pause_started_ms: 0,
        };
        let v = s.view(u64::MAX);
        assert!((0.0..=1.0).contains(&v.progress));
        s.resume(u64::MAX).unwrap();
        assert_eq!(s.planned_end_ms(), Some(u64::MAX));
        let _ = s.view(0);
        let _ = s.stop(u64::MAX).unwrap();
    }

    #[test]
    fn progress_stays_in_unit_interval() {
        let s = classic_at(T0);
        for now in [
            0,
            T0 - 1,
            T0,
            T0 + 1,
            T0 + 12 * MIN,
            T0 + 25 * MIN,
            T0 + 99 * MIN,
            u64::MAX,
        ] {
            let p = s.view(now).progress;
            assert!((0.0..=1.0).contains(&p), "{p} at {now}");
        }
        assert_eq!(s.view(T0 + 99 * MIN).progress, 1.0);
        assert_eq!(s.view(T0 + 99 * MIN).remaining_ms, 0);
        // A zero-length plan (only reachable from a hand-edited snapshot) is not a NaN.
        let mut z = Session::Idle;
        let zero = PresetSpec {
            focus_ms: 0,
            ..spec(Preset::Classic)
        };
        z.start(id("z"), Preset::Custom, zero, T0).unwrap();
        let p = z.view(T0).progress;
        assert!((0.0..=1.0).contains(&p), "{p}");
    }

    #[test]
    fn one_milestone_per_transition_none_per_tick() {
        let mut s = Session::Idle;
        assert_eq!(
            s.start(id("a"), Preset::Classic, spec(Preset::Classic), T0),
            Ok(())
        );
        for t in (0..25 * 60).map(|k| T0 + k * S) {
            assert_eq!(s.advance(t), None, "tick at {t}");
        }
        assert_eq!(s.pause(T0 + 10 * MIN), Ok(()));
        for t in (0..120).map(|k| T0 + 10 * MIN + k * S) {
            assert_eq!(s.advance(t), None);
        }
        assert_eq!(s.resume(T0 + 12 * MIN), Ok(()));
        let ending_tick = T0 + 27 * MIN;
        let mut endings = 0;
        for t in (0..60 * 60).map(|k| T0 + 12 * MIN + k * S) {
            if let Some(m) = s.advance(t) {
                assert_eq!(t, ending_tick);
                assert!(matches!(m, Milestone::Ended(_)));
                endings += 1;
            }
        }
        assert_eq!(endings, 1);
    }

    #[test]
    fn wrong_state_for_pause_while_paused_and_resume_while_running() {
        let mut s = classic_at(T0);
        let running = s.clone();
        assert_eq!(s.resume(T0 + MIN), Err(TimerError::WrongState));
        assert_eq!(s, running);
        s.pause(T0 + MIN).unwrap();
        let paused = s.clone();
        assert_eq!(s.pause(T0 + 2 * MIN), Err(TimerError::WrongState));
        assert_eq!(s, paused);

        let mut idle = Session::Idle;
        assert_eq!(idle.pause(T0), Err(TimerError::NothingRunning));
        assert_eq!(idle.resume(T0), Err(TimerError::NothingRunning));
        assert_eq!(idle.stop(T0), Err(TimerError::NothingRunning));
        assert_eq!(idle, Session::Idle);
    }

    #[test]
    fn start_while_running_is_already_running_and_changes_nothing() {
        let mut s = classic_at(T0);
        let running = s.clone();
        assert_eq!(
            s.start(id("b"), Preset::Quick, spec(Preset::Quick), T0 + MIN),
            Err(TimerError::AlreadyRunning)
        );
        assert_eq!(s, running);
        s.pause(T0 + MIN).unwrap();
        let paused = s.clone();
        assert_eq!(
            s.start(id("b"), Preset::Quick, spec(Preset::Quick), T0 + MIN),
            Err(TimerError::AlreadyRunning)
        );
        assert_eq!(s, paused);
    }

    #[test]
    fn stop_records_real_focused_ms_excluding_pauses() {
        // Stop while paused: the open pause counts as paused, not focused.
        let mut s = classic_at(T0);
        s.pause(T0 + 4 * MIN).unwrap();
        s.resume(T0 + 6 * MIN).unwrap();
        s.pause(T0 + 9 * MIN).unwrap();
        let r = s.stop(T0 + 20 * MIN).unwrap();
        assert_eq!(r.focused_ms, 7 * MIN);
        assert_eq!(r.paused_total_ms, 13 * MIN);
        assert_eq!(r.ended_ms, T0 + 20 * MIN);
        assert_eq!(r.end_reason, EndReason::Stopped);
        assert!(s.is_idle());

        // Stop while running, with an earlier pause.
        let mut s = classic_at(T0);
        s.pause(T0 + 4 * MIN).unwrap();
        s.resume(T0 + 6 * MIN).unwrap();
        let r = s.stop(T0 + 16 * MIN + 500).unwrap();
        assert_eq!(r.focused_ms, 14 * MIN + 500);
        assert_eq!(r.paused_total_ms, 2 * MIN);
        assert_eq!(r.end_reason, EndReason::Stopped);
    }

    #[test]
    fn session_snapshot_round_trips_json() {
        let mut s = classic_at(T0);
        let j = serde_json::to_value(&s).unwrap();
        assert_eq!(j["state"], "running");
        assert_eq!(j["preset"], "classic");
        assert_eq!(j["phase"], "focus");
        assert_eq!(j["id"], "a");
        assert_eq!(j["started_ms"], T0);
        assert_eq!(serde_json::from_value::<Session>(j).unwrap(), s);

        s.pause(T0 + MIN).unwrap();
        let text = serde_json::to_string(&s).unwrap();
        assert!(text.contains("\"state\":\"paused\""), "{text}");
        assert!(text.contains("\"pause_started_ms\""), "{text}");
        assert_eq!(serde_json::from_str::<Session>(&text).unwrap(), s);

        let idle = serde_json::to_string(&Session::Idle).unwrap();
        assert_eq!(idle, r#"{"state":"idle"}"#);
        assert_eq!(
            serde_json::from_str::<Session>(&idle).unwrap(),
            Session::Idle
        );
    }
}
