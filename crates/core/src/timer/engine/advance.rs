use super::Session;
use crate::timer::{EndReason, Milestone, SessionRecord};

impl Session {
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

    /// `clamp(now − started − paused_total − current_pause, 0, planned)`. While paused the
    /// count is taken at the pause, so it stays frozen even if the clock is set back.
    pub(super) fn elapsed_ms(&self, now_ms: u64) -> u64 {
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

pub(super) fn planned_end(started_ms: u64, planned_ms: u64, paused_total_ms: u64) -> u64 {
    started_ms
        .saturating_add(planned_ms)
        .saturating_add(paused_total_ms)
}
