use super::*;
use crate::timer::{EngineState, Milestone, PresetId, QUICK_START_MS, default_presets};

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

fn classic_at(now: u64) -> Session {
    let mut s = Session::default();
    s.start(id("a"), steady(), now).unwrap();
    s
}

fn ended(m: Option<Milestone>) -> SessionRecord {
    match m {
        Some(Milestone::Ended(r)) => r,
        other => panic!("expected Ended, got {other:?}"),
    }
}

mod advance;
mod lifecycle;
mod view;
