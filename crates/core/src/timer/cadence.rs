//! The day's rhythm, derived from today's stored rows: which round comes next, how much
//! focus has been done and where the local day starts and ends. Pure: callers pass time in.

use super::{BreakKind, Phase};

const MINUTE_MS: i128 = 60_000;
const DAY_MS: i128 = 86_400_000;
const DEEP_FOCUS: &str = "Deep focus";

/// A stored session as the cadence reads it. `quick` rows neither count nor reset a chain.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DaySession {
    pub quick: bool,
    pub phase: Phase,
    pub break_kind: Option<BreakKind>,
    pub started_ms: u64,
    pub ended_ms: u64,
    pub focused_ms: u64,
    /// The row ended at its planned end (not `stopped`).
    pub completed: bool,
}

/// The round a focus started at `now_ms` is, from today's rows in start order.
///
/// A completed focus adds one; a started long break resets the count, even if it was skipped
/// or cut; `quick` rows are ignored. If the last break ended more than `long_break_ms` before
/// `now_ms`, the chain has lapsed and the count resets. With no break yet today the count
/// stands. The first focus of a day is round 1. A clock set back never resets (the gap
/// saturates at zero).
pub fn next_round(today: &[DaySession], now_ms: u64, long_break_ms: u64) -> u8 {
    let mut count: u32 = 0;
    let mut last_break_end: Option<u64> = None;
    for session in today.iter().filter(|s| !s.quick) {
        match session.phase {
            Phase::Focus if session.completed => count = count.saturating_add(1),
            Phase::Focus => {}
            Phase::Break => {
                if session.break_kind == Some(BreakKind::Long) {
                    count = 0;
                }
                last_break_end =
                    Some(last_break_end.map_or(session.ended_ms, |e| e.max(session.ended_ms)));
            }
        }
    }
    if last_break_end.is_some_and(|end| now_ms.saturating_sub(end) > long_break_ms) {
        count = 0;
    }
    u8::try_from(count.saturating_add(1)).unwrap_or(u8::MAX)
}

/// Focus done today: the `focused_ms` of every focus row of every kind and end reason
/// (`quick`, stopped, extended), plus the live focus.
pub fn focused_today(today: &[DaySession], live_ms: u64) -> u64 {
    today
        .iter()
        .filter(|s| s.phase == Phase::Focus)
        .fold(live_ms, |total, s| total.saturating_add(s.focused_ms))
}

/// `[start, end)` of the local day containing `now_ms`, in epoch milliseconds. Each midnight
/// uses the offset at that midnight, so a daylight-saving day is 23 or 25 hours.
/// `offset_min_at` gives the UTC offset in minutes at an instant.
pub fn local_day(now_ms: u64, offset_min_at: impl Fn(u64) -> i32) -> (u64, u64) {
    let offset_ms = |at: i128| i128::from(offset_min_at(clamp_ms(at))) * MINUTE_MS;
    let local_now = i128::from(now_ms) + offset_ms(i128::from(now_ms));
    let local_start = local_now.div_euclid(DAY_MS) * DAY_MS;
    let local_end = local_start + DAY_MS;
    // The midnight's own offset: guess with the offset at `now`, then look again at the guess.
    let utc_at_midnight = |local: i128| {
        let guess = local - offset_ms(i128::from(now_ms));
        local - offset_ms(guess)
    };
    let start = clamp_ms(utc_at_midnight(local_start));
    let end = clamp_ms(utc_at_midnight(local_end));
    (start.min(end), end)
}

fn clamp_ms(ms: i128) -> u64 {
    u64::try_from(ms.max(0)).unwrap_or(u64::MAX)
}

/// What a session is called: its intent, or "Deep focus".
pub fn session_name(intent: Option<&str>) -> &str {
    intent.unwrap_or(DEEP_FOCUS)
}

#[cfg(test)]
mod tests;
