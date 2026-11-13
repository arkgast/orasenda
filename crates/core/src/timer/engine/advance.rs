//! The clock-driven transitions: the warning, the end of a focus and the end of a break.

use super::{Live, Session, WARNING_MS};
use crate::timer::{EndReason, Milestone, Phase, SessionPreset, SessionRecord};

/// Most ends one call can cross. Real calls cross at most a handful (a focus, its automatic
/// steps up to 150 minutes, a break); this only bounds a corrupt snapshot.
const MAX_ENDS: usize = 4_096;

impl Session {
    /// Applies everything that has come due by `now_ms`, in order, each at its true wall time.
    ///
    /// - Two minutes before an end that is more than two minutes long, once: `Warned`. A
    ///   warning whose end has also passed is not emitted.
    /// - A focus end becomes, at the planned end and whatever the lateness: an automatic step
    ///   (`Extended`) while `auto_longest_ms` is set and the next step stays within it;
    ///   otherwise the focus completes and its break starts (`BreakStarted`). A `quick` focus
    ///   ends with `Ended`, plus `RollOn` when `auto_longest_ms` is set.
    /// - A break end returns `Ended([focus, cut breaks.., break])` and leaves the engine
    ///   [`Session::Idle`].
    ///
    /// A paused or idle engine never moves. Once `Ended` is returned the engine is idle and has
    /// no end to compare against, so a later call with an earlier `now_ms` (a clock set back)
    /// cannot revive the session; only [`Session::start`] leaves `Idle`.
    pub fn advance(&mut self, now_ms: u64, auto_longest_ms: Option<u64>) -> Vec<Milestone> {
        let mut milestones = Vec::new();
        for _ in 0..MAX_ENDS {
            let Session::Running { live } = self else {
                break;
            };
            let end = live.planned_end();
            if now_ms < end {
                if !live.warned
                    && live.planned_ms > WARNING_MS
                    && now_ms >= end.saturating_sub(WARNING_MS)
                {
                    live.warned = true;
                    milestones.push(Milestone::Warned);
                }
                break;
            }
            let keep_going = match live.phase {
                Phase::Focus => self.focus_ends(end, auto_longest_ms, &mut milestones),
                Phase::Break => {
                    self.break_ends(end, &mut milestones);
                    false
                }
            };
            if !keep_going {
                break;
            }
        }
        milestones
    }

    /// The focus reached its planned end at `end`. True when the engine is still running and
    /// the next end may already be due.
    fn focus_ends(
        &mut self,
        end: u64,
        auto_longest_ms: Option<u64>,
        milestones: &mut Vec<Milestone>,
    ) -> bool {
        let Session::Running { live } = self else {
            return false;
        };
        if live.preset == SessionPreset::Quick {
            let record = live.focus_record(
                end,
                live.planned_ms,
                live.paused_total_ms,
                EndReason::Completed,
            );
            milestones.push(Milestone::Ended(vec![record]));
            if auto_longest_ms.is_some() {
                milestones.push(Milestone::RollOn);
            }
            *self = Session::Idle;
            return false;
        }
        if let Some(longest_ms) = auto_longest_ms
            && live.take_auto_step(longest_ms)
        {
            milestones.push(Milestone::Extended);
            return true;
        }
        let break_id = live.take_break_id();
        let break_live = live.start_break(break_id, end, live.planned_ms, live.paused_total_ms);
        *self = Session::Running { live: break_live };
        milestones.push(Milestone::BreakStarted);
        true
    }

    /// The break reached its planned end at `end`: the whole session is recorded.
    fn break_ends(&mut self, end: u64, milestones: &mut Vec<Milestone>) {
        let Session::Running { live } = std::mem::take(self) else {
            return;
        };
        let brk = live.break_record(
            end,
            live.planned_ms,
            live.paused_total_ms,
            EndReason::Completed,
        );
        milestones.push(Milestone::Ended(live.into_records(brk)));
    }
}

impl Live {
    /// `started + planned + paused_total + gap`: when the phase ends if nothing changes.
    pub(crate) fn planned_end(&self) -> u64 {
        self.started_ms
            .saturating_add(self.planned_ms)
            .saturating_add(self.paused_total_ms)
            .saturating_add(self.gap_ms)
    }

    /// `clamp(at − started − paused_total − gap, 0, planned)`.
    pub(crate) fn elapsed_at(&self, at_ms: u64) -> u64 {
        at_ms
            .saturating_sub(self.started_ms)
            .saturating_sub(self.paused_total_ms)
            .saturating_sub(self.gap_ms)
            .min(self.planned_ms)
    }

    /// The row for this focus, ending at `ended_ms` (never before its start).
    pub(crate) fn focus_record(
        &self,
        ended_ms: u64,
        focused_ms: u64,
        paused_total_ms: u64,
        end_reason: EndReason,
    ) -> SessionRecord {
        SessionRecord {
            id: self.id.clone(),
            preset: self.preset.clone(),
            phase: Phase::Focus,
            planned_ms: self.planned_ms,
            started_ms: self.started_ms,
            ended_ms: ended_ms.max(self.started_ms),
            paused_total_ms,
            focused_ms,
            end_reason,
            extensions: self.extensions,
            break_kind: None,
        }
    }

    /// The row for this break, ending at `ended_ms`. Its `focused_ms` is the time it counted
    /// down, so `ended − started = focused + paused_total` holds for breaks too.
    pub(crate) fn break_record(
        &self,
        ended_ms: u64,
        elapsed_ms: u64,
        paused_total_ms: u64,
        end_reason: EndReason,
    ) -> SessionRecord {
        SessionRecord {
            id: self.id.clone(),
            preset: self.preset.clone(),
            phase: Phase::Break,
            planned_ms: self.planned_ms,
            started_ms: self.started_ms,
            ended_ms: ended_ms.max(self.started_ms),
            paused_total_ms,
            focused_ms: elapsed_ms,
            end_reason,
            extensions: 0,
            break_kind: self.break_kind,
        }
    }

    /// The whole session as rows: the finished focus, the cut breaks, then `last_break`.
    pub(crate) fn into_records(self, last_break: SessionRecord) -> Vec<SessionRecord> {
        let mut records: Vec<SessionRecord> = self.open_focus.into_iter().map(|b| *b).collect();
        records.extend(self.cut_breaks);
        records.push(last_break);
        records
    }
}
