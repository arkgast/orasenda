//! Orasenda product logic.
//!
//! Core never depends on Tauri or OS APIs, never branches on the target OS and never reads the
//! clock: callers pass time in (ADR-001).

mod app_info;
pub mod blocking;
pub mod clock;
pub mod platform;
pub mod timer;
pub mod usage;

pub use app_info::{AppInfo, Os};
pub use blocking::{
    AppRef, BlockAction, BlockRule, Decision, Gate, GateAction, SAFETY_ALLOWLIST, decide,
};
pub use clock::{Hlc, HlcStamp, ParseHlcStampError};
pub use platform::{
    AppControl, ForegroundSource, HourCycle, IdleSource, KeepAwake, LocalTime, NoopKeepAwake,
    NoopNotifier, NotificationStatus, Notifier, PlatformError, UtcLocalTime,
};
pub use timer::{
    CustomSpec, DefaultPreset, EndReason, EngineState, EngineView, Milestone, Phase, Preset,
    PresetDef, PresetField, PresetId, PresetInvalid, PresetSpec, QUICK_START_MS, Session,
    SessionId, SessionPreset, SessionRecord, TimerError, default_presets, format_clock,
    format_remaining, normalize_name, spoken_remaining,
};
pub use usage::{IDLE_THRESHOLD_MS, UsageSegment, UsageTracker};
