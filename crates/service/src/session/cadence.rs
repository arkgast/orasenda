//! The day's rhythm in the service: today's rows, the round, the deep-hours cap and the
//! values the engine is given (`auto`, the break id).

use orasenda_core::timer::suggestions::BreakFor;
use orasenda_core::{
    BreakKind, DaySession, EngineView, Phase, SessionId, SessionPreset, SessionRecord,
    focused_today, local_day, next_round,
};
use orasenda_store::focus_sessions::{self, SessionRow};

use super::*;
use crate::api::{MilestoneEvent, MilestoneKind};

const MINUTE_MS: u64 = 60_000;
const HOUR_MS: u64 = 3_600_000;
/// The last stretch of a focus in which "+10 min" is offered.
const WARNING_MS: u64 = 2 * MINUTE_MS;

impl SessionService {
    /// `auto` for the engine: the longest focus in milliseconds while auto-continue is on.
    pub(super) fn auto_longest_ms(&self) -> Option<u64> {
        self.settings
            .auto_continue
            .then(|| u64::from(self.settings.longest_focus_min) * MINUTE_MS)
    }

    /// Gives the engine the id of the break its focus may start (see the engine's
    /// `reserve_break_id`). Makes an id only when one is needed.
    pub(super) fn reserve_break_id(&mut self) {
        if self.engine.needs_break_id() {
            let id = (self.ids)();
            self.engine.reserve_break_id(id);
        }
    }

    /// The local day around `now_ms`: `[start, end)`.
    fn day_bounds(&self, now_ms: u64) -> (u64, u64) {
        local_day(now_ms, |at| self.platform.local_time.utc_offset_min(at))
    }

    /// Today's sessions in start order: the stored rows, the records still `unsaved`, and what
    /// the engine holds for the session in a break (its open focus and cut breaks), except the
    /// one named by `skip`. The live focus is not a row yet; callers add it.
    pub(super) fn day_sessions(&self, now_ms: u64, skip: Option<&SessionId>) -> Vec<DaySession> {
        let (from, to) = self.day_bounds(now_ms);
        let mut rows: Vec<DaySession> = self.stored_between(from, to);
        let held = self
            .engine
            .open_focus()
            .into_iter()
            .chain(self.engine.cut_breaks());
        rows.extend(
            self.unsaved
                .iter()
                .chain(held.filter(|r| Some(&r.id) != skip))
                .filter(|r| (from..to).contains(&r.started_ms))
                .map(from_record),
        );
        rows.sort_by_key(|s| (s.started_ms, s.ended_ms));
        rows
    }

    fn stored_between(&self, from: u64, to: u64) -> Vec<DaySession> {
        let Some(store) = &self.store else {
            return Vec::new();
        };
        let read = || {
            store
                .read(|txn| focus_sessions::started_between(txn, from, to))
                .map(|rows| rows.iter().filter_map(from_row).collect())
        };
        match self.day_cache.get_or_read(from, read) {
            Ok(rows) => {
                self.day_read_failed.set(false);
                rows
            }
            Err(error) => {
                // Once per failure, not once per view. The view shows the store line until
                // a read works again, and the next tick retries.
                if !self.day_read_failed.replace(true) {
                    eprintln!("cadence: today's sessions could not be read ({error})");
                }
                Vec::new()
            }
        }
    }

    /// The round a session of `preset` started at `now_ms` is.
    pub(super) fn round_for(&self, preset: &SessionPreset, now_ms: u64) -> u8 {
        let SessionPreset::Library { long_break_min, .. } = preset else {
            return 1;
        };
        let long_break_ms = u64::from(*long_break_min) * MINUTE_MS;
        next_round(&self.day_sessions(now_ms, None), now_ms, long_break_ms)
    }

    /// The deep-hours cap in milliseconds, when it is on.
    fn cap_ms(&self) -> Option<u64> {
        self.settings
            .deep_cap_on
            .then(|| u64::from(self.settings.deep_cap_hours) * HOUR_MS)
    }

    /// The quiet line while idle once today's focus has reached the cap.
    pub(super) fn cap_line(&self, now_ms: u64) -> Option<String> {
        let cap_ms = self.cap_ms()?;
        let total = focused_today(&self.day_sessions(now_ms, None), 0);
        (total >= cap_ms).then(|| format!("{} hours of focus today.", self.settings.deep_cap_hours))
    }

    /// The `n` of `pick`: today's breaks of this kind so far.
    pub(super) fn breaks_today(&self, kind: BreakFor, now_ms: u64) -> usize {
        let wanted = match kind {
            BreakFor::Short => BreakKind::Short,
            BreakFor::Long => BreakKind::Long,
        };
        self.day_sessions(now_ms, None)
            .iter()
            .filter(|s| s.phase == Phase::Break && s.break_kind == Some(wanted))
            .count()
    }

    /// Fires `capReached` when `focus`, just finished, takes today's focus from under the cap
    /// to the cap or past it. Once per session, and never for the focus a relaunch restored in
    /// its break.
    pub(super) fn check_cap(&mut self, focus: &SessionRecord, now_ms: u64, outcome: &mut Outcome) {
        let seen = match &self.cap_checked {
            Some((id, focused)) if *id == focus.id => Some(*focused),
            _ => None,
        };
        if seen.is_some_and(|focused| focused >= focus.focused_ms) {
            return;
        }
        self.cap_checked = Some((focus.id.clone(), focus.focused_ms));
        let Some(cap_ms) = self.cap_ms() else {
            return;
        };
        let before = focused_today(&self.day_sessions(now_ms, Some(&focus.id)), 0);
        let crossed_before = seen.is_some_and(|f| before.saturating_add(f) >= cap_ms);
        if before < cap_ms && !crossed_before && before.saturating_add(focus.focused_ms) >= cap_ms {
            outcome.milestones.push(MilestoneEvent {
                kind: MilestoneKind::CapReached,
                end_reason: None,
                session_id: Some(focus.id.clone()),
                phase: Phase::Focus,
                quick: focus.preset == SessionPreset::Quick,
            });
        }
    }

    /// Whether "+10 min" can be asked for in `engine`'s state, the cap aside: a running focus
    /// in its last two minutes (not while auto-continue steps), or a running break with its
    /// focus open. Never for `quick`, never while paused.
    pub(super) fn extend_offered(&self, engine: &EngineView) -> bool {
        if engine.state != orasenda_core::EngineState::Running
            || engine.preset == Some(SessionPreset::Quick)
        {
            return false;
        }
        match engine.phase {
            Phase::Focus => !self.settings.auto_continue && engine.remaining_ms <= WARNING_MS,
            Phase::Break => engine.open_focus,
        }
    }

    /// [`SessionService::extend_offered`] and under the cap.
    pub(super) fn can_extend(&self, engine: &EngineView) -> bool {
        self.extend_offered(engine) && engine.extensions < self.settings.extension_cap
    }
}

fn from_record(record: &SessionRecord) -> DaySession {
    DaySession {
        quick: record.preset == SessionPreset::Quick,
        phase: record.phase,
        break_kind: record.break_kind,
        started_ms: record.started_ms,
        ended_ms: record.ended_ms,
        focused_ms: record.focused_ms,
        completed: record.end_reason == orasenda_core::EndReason::Completed,
    }
}

/// A stored row as the cadence reads it. A row with a phase it does not know is left out.
fn from_row(row: &SessionRow) -> Option<DaySession> {
    let phase = match row.phase.as_str() {
        "focus" => Phase::Focus,
        "break" => Phase::Break,
        _ => return None,
    };
    let break_kind = match row.break_kind.as_deref() {
        Some("short") => Some(BreakKind::Short),
        Some("long") => Some(BreakKind::Long),
        _ => None,
    };
    Some(DaySession {
        quick: row.preset == "quick",
        phase,
        break_kind,
        started_ms: row.started_ms,
        ended_ms: row.ended_ms,
        focused_ms: row.focused_ms,
        completed: row.end_reason == "completed",
    })
}
