//! The seam between the publish steps and the app.

use std::sync::{Arc, Mutex};

use orasenda_core::Notifier;

use crate::api::{
    ClockTick, KeyboardView, MilestoneEvent, PresetEntry, Settings, Theme, TimerView,
};
use crate::session::{SessionService, Surfaces, ViewGate};

/// Where the publish steps send their output: the running app, or a recording fake in tests.
pub trait Host: Clone + Send + Sync + 'static {
    /// The service, or `None` before `session::setup` has managed it.
    fn service(&self) -> Option<&Mutex<SessionService>>;
    fn surfaces(&self) -> Option<&Surfaces>;
    /// The publish-order gate, or `None` before `session::setup` has managed it.
    fn view_gate(&self) -> Option<&ViewGate>;
    fn notifier(&self) -> Arc<dyn Notifier>;
    fn now_ms(&self) -> u64;
    /// Whether Orasenda is the active app (`NSApplication.isActive`), not whether some window
    /// has focus. The notification for the two-minute warning stays quiet while it is.
    fn app_active(&self) -> bool;
    /// Emits `timer-tick`. An emit error is logged, never fatal.
    fn emit_timer_tick(&self, view: &TimerView);
    /// Emits `timer-milestone`. An emit error is logged, never fatal.
    fn emit_milestone(&self, event: &MilestoneEvent);
    /// Emits `clock-tick`. An emit error is logged, never fatal.
    fn emit_clock_tick(&self, tick: &ClockTick);
    /// Emits `settings-changed`. An emit error is logged, never fatal.
    fn emit_settings_changed(&self, settings: &Settings);
    /// Emits `presets-changed` and tells the surfaces. An emit error is logged, never fatal.
    fn emit_presets_changed(&self, presets: &[PresetEntry]);
    /// Emits `keyboard-changed`. An emit error is logged, never fatal.
    fn emit_keyboard_changed(&self, view: &KeyboardView);
    /// Applies the app-wide theme (`System` clears the override). Never called under the
    /// service lock.
    fn apply_theme(&self, theme: Theme);
}
