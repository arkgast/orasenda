use super::*;
use crate::timer::{CustomSpec, EngineState, Milestone, QUICK_START_MS};

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

mod advance;
mod lifecycle;
mod view;
