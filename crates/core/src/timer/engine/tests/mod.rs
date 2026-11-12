use super::*;
use crate::timer::{
    BreakKind, EngineState, Milestone, PresetId, QUICK_START_MS, default_presets,
};

const S: u64 = 1_000;
const MIN: u64 = 60 * S;
const T0: u64 = 1_794_237_600_000;

fn id(s: &str) -> SessionId {
    SessionId(s.into())
}

/// Steady Focus, 25 / 5, as a session snapshot.
fn steady() -> SessionPreset {
    library(1)
}

/// The snapshot of default `index` (0 Gentle Start, 1 Steady Focus, 2 Deep Work).
fn library(index: usize) -> SessionPreset {
    let d = &default_presets()[index];
    SessionPreset::Library {
        id: d.id.clone(),
        name: d.name.clone(),
        focus_min: d.focus_min,
        break_min: d.break_min,
        long_break_min: d.long_break_min,
        rounds: d.rounds,
    }
}

/// A session of default `index` at round `round`, started at `now`.
fn at(index: usize, round: u8, now: u64) -> Session {
    let mut s = Session::default();
    s.start(id("a"), library(index), round, now).unwrap();
    s
}

/// Steady Focus, round 1.
fn classic_at(now: u64) -> Session {
    at(1, 1, now)
}

/// The records of the one `Ended` milestone in `ms`.
fn records(ms: Vec<Milestone>) -> Vec<SessionRecord> {
    let mut found = ms.into_iter().filter_map(|m| match m {
        Milestone::Ended(records) => Some(records),
        _ => None,
    });
    let records = found.next().expect("an Ended milestone");
    assert!(found.next().is_none(), "more than one Ended milestone");
    records
}

/// The first (focus) record of the `Ended` milestone in `ms`.
fn ended(ms: Vec<Milestone>) -> SessionRecord {
    records(ms).remove(0)
}

/// `ended - started = focused + paused_total + cut breaks` (the row invariant).
fn assert_span(focus: &SessionRecord, cut_breaks_ms: u64) {
    assert_eq!(
        focus.ended_ms - focus.started_ms,
        focus.focused_ms + focus.paused_total_ms + cut_breaks_ms,
        "row invariant for {}",
        focus.id.0
    );
}

mod advance;
mod auto;
mod breaks;
mod extend;
mod lifecycle;
mod sleep;
mod view;
