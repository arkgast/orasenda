//! Timer domain types: presets, session records and the engine's view. No clock, no I/O.

use serde::{Deserialize, Serialize};
use specta::Type;

pub mod engine;
pub mod format;
pub mod preset;

pub use engine::Session;
pub use format::{format_clock, format_remaining, spoken_remaining};
pub use preset::{
    DefaultPreset, PresetDef, PresetField, PresetId, PresetInvalid, SessionPreset, default_presets,
    normalize_name,
};

/// Length of a Quick start focus block, in milliseconds.
pub const QUICK_START_MS: u64 = 120_000;

const MINUTE_MS: u64 = 60_000;

/// A named timing preset, serialized snake_case (`"fifty_ten"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum Preset {
    Classic,
    FiftyTen,
    DeepBlock,
    Custom,
    Quick,
}

/// The user's own focus and break lengths, in minutes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CustomSpec {
    pub focus_min: u16,
    pub break_min: u16,
}

impl Default for CustomSpec {
    fn default() -> CustomSpec {
        CustomSpec {
            focus_min: 45,
            break_min: 10,
        }
    }
}

impl CustomSpec {
    /// Focus must be 5..=180 minutes and break 1..=60 minutes.
    pub fn validate(&self) -> Result<(), TimerError> {
        if (5..=180).contains(&self.focus_min) && (1..=60).contains(&self.break_min) {
            Ok(())
        } else {
            Err(TimerError::InvalidSpec)
        }
    }
}

/// Resolved lengths for a preset, in milliseconds.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PresetSpec {
    pub focus_ms: u64,
    pub short_break_ms: u64,
    pub long_break_ms: u64,
    pub rounds_before_long: u8,
}

impl PresetSpec {
    fn minutes(focus: u64, short: u64, long: u64, rounds: u8) -> PresetSpec {
        PresetSpec {
            focus_ms: focus * MINUTE_MS,
            short_break_ms: short * MINUTE_MS,
            long_break_ms: long * MINUTE_MS,
            rounds_before_long: rounds,
        }
    }
}

impl Preset {
    /// The lengths for this preset. `custom` is used (and validated) only for
    /// [`Preset::Custom`]; [`Preset::Quick`] ignores it.
    pub fn spec(&self, custom: &CustomSpec) -> Result<PresetSpec, TimerError> {
        match self {
            Preset::Classic => Ok(PresetSpec::minutes(25, 5, 15, 4)),
            Preset::FiftyTen => Ok(PresetSpec::minutes(50, 10, 20, 4)),
            Preset::DeepBlock => Ok(PresetSpec::minutes(90, 15, 30, 2)),
            Preset::Custom => {
                custom.validate()?;
                let short = u64::from(custom.break_min);
                Ok(PresetSpec::minutes(
                    u64::from(custom.focus_min),
                    short,
                    short * 3,
                    4,
                ))
            }
            Preset::Quick => {
                let classic = Preset::Classic.spec(custom)?;
                Ok(PresetSpec {
                    focus_ms: QUICK_START_MS,
                    ..classic
                })
            }
        }
    }
}

/// Which part of the loop a session is in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Focus,
}

/// How a session ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum EndReason {
    Completed,
    Stopped,
}

/// Opaque session identifier, serialized as a bare string.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(transparent)]
pub struct SessionId(pub String);

/// A finished session.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: SessionId,
    pub preset: Preset,
    pub phase: Phase,
    pub planned_ms: u64,
    pub started_ms: u64,
    pub ended_ms: u64,
    pub paused_total_ms: u64,
    pub focused_ms: u64,
    pub end_reason: EndReason,
    pub extensions: u8,
}

/// Whether the timer is idle, counting or paused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum EngineState {
    Idle,
    Running,
    Paused,
}

/// A snapshot of the engine for the UI layer.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EngineView {
    pub state: EngineState,
    pub phase: Phase,
    pub preset: Option<Preset>,
    pub session_id: Option<SessionId>,
    pub remaining_ms: u64,
    pub progress: f64,
    pub planned_end_ms: Option<u64>,
    /// The session's planned focus length, fixed at start; `None` while idle.
    pub planned_ms: Option<u64>,
}

/// Something worth recording or announcing that the engine did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Milestone {
    Started,
    Paused,
    Resumed,
    Ended(SessionRecord),
}

/// Why a timer command was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TimerError {
    AlreadyRunning,
    NothingRunning,
    WrongState,
    InvalidSpec,
}

impl std::fmt::Display for TimerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            TimerError::AlreadyRunning => "a session is already running",
            TimerError::NothingRunning => "no session is running",
            TimerError::WrongState => "that can't be done while the session is in this state",
            TimerError::InvalidSpec => "focus can be 5 to 180 minutes, and a break 1 to 60",
        })
    }
}

impl std::error::Error for TimerError {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::NotificationStatus;

    fn custom(f: u16, b: u16) -> CustomSpec {
        CustomSpec {
            focus_min: f,
            break_min: b,
        }
    }
    const MIN: u64 = 60_000;

    #[test]
    fn preset_specs_match_the_spec() {
        let c = CustomSpec::default();
        let s = |f, sb, lb, r| PresetSpec {
            focus_ms: f * MIN,
            short_break_ms: sb * MIN,
            long_break_ms: lb * MIN,
            rounds_before_long: r,
        };
        assert_eq!(Preset::Classic.spec(&c), Ok(s(25, 5, 15, 4)));
        assert_eq!(Preset::FiftyTen.spec(&c), Ok(s(50, 10, 20, 4)));
        assert_eq!(Preset::DeepBlock.spec(&c), Ok(s(90, 15, 30, 2)));
        assert_eq!(Preset::Custom.spec(&custom(45, 10)), Ok(s(45, 10, 30, 4)));
        assert_eq!(Preset::Custom.spec(&custom(30, 7)), Ok(s(30, 7, 21, 4)));
        assert_eq!(
            Preset::Custom.spec(&custom(4, 10)),
            Err(TimerError::InvalidSpec)
        );
        assert_eq!(Preset::Quick.spec(&c).unwrap().focus_ms, QUICK_START_MS);
    }

    #[test]
    fn quick_is_two_minutes_with_classic_breaks() {
        let q = Preset::Quick.spec(&CustomSpec::default()).unwrap();
        let c = Preset::Classic.spec(&CustomSpec::default()).unwrap();
        assert_eq!(q.focus_ms, 120_000);
        assert_eq!(q.short_break_ms, c.short_break_ms);
        assert_eq!(q.long_break_ms, c.long_break_ms);
        assert_eq!(q.rounds_before_long, c.rounds_before_long);
    }

    #[test]
    fn quick_ignores_custom_range() {
        let base = Preset::Quick.spec(&CustomSpec::default());
        assert_eq!(Preset::Quick.spec(&custom(0, 0)), base);
        assert_eq!(Preset::Quick.spec(&custom(999, 999)), base);
    }

    #[test]
    fn custom_spec_bounds() {
        let bad = Err(TimerError::InvalidSpec);
        assert_eq!(custom(4, 10).validate(), bad);
        assert_eq!(custom(5, 10).validate(), Ok(()));
        assert_eq!(custom(180, 10).validate(), Ok(()));
        assert_eq!(custom(181, 10).validate(), bad);
        assert_eq!(custom(45, 0).validate(), bad);
        assert_eq!(custom(45, 1).validate(), Ok(()));
        assert_eq!(custom(45, 60).validate(), Ok(()));
        assert_eq!(custom(45, 61).validate(), bad);
    }

    #[test]
    fn custom_spec_default_is_45_10() {
        assert_eq!(CustomSpec::default(), custom(45, 10));
    }

    #[test]
    fn preset_serializes_snake_case() {
        let j = |p| serde_json::to_string(&p).unwrap();
        assert_eq!(j(Preset::FiftyTen), "\"fifty_ten\"");
        assert_eq!(j(Preset::DeepBlock), "\"deep_block\"");
        assert_eq!(j(Preset::Quick), "\"quick\"");
    }

    #[test]
    fn notification_status_serializes_camel_case() {
        assert_eq!(
            serde_json::to_string(&NotificationStatus::NotDetermined).unwrap(),
            "\"notDetermined\""
        );
    }

    #[test]
    fn timer_error_serializes_camel_case() {
        assert_eq!(
            serde_json::to_string(&TimerError::WrongState).unwrap(),
            "\"wrongState\""
        );
    }

    #[test]
    fn session_id_serializes_as_plain_string() {
        assert_eq!(
            serde_json::to_string(&SessionId("abc".into())).unwrap(),
            "\"abc\""
        );
        let back: SessionId = serde_json::from_str("\"abc\"").unwrap();
        assert_eq!(back, SessionId("abc".into()));
    }
}
