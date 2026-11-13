//! The seam between the publish steps and the app.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use orasenda_core::Notifier;

use crate::api::{
    ClockTick, DataOverview, KeyboardView, MilestoneEvent, NoteView, PresetEntry, Settings, Theme,
    TimerView,
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
    /// Emits `inbox-changed`: the live notes, newest first. An emit error is logged, never fatal.
    fn emit_inbox_changed(&self, notes: &[NoteView]);
    /// Applies the app-wide theme (`System` clears the override). Never called under the
    /// service lock.
    fn apply_theme(&self, theme: Theme);
    /// The app data folder (`orasenda.db` and `Backups/` live in it), `None` when the OS
    /// can't name it.
    fn data_dir(&self) -> Option<PathBuf>;
    /// Emits `backups-changed`. An emit error is logged, never fatal.
    fn emit_backups_changed(&self, overview: &DataOverview);
    /// Restarts the app so a staged Restore or Delete all data lands. In the app it does not
    /// return; tests record it.
    fn restart(&self);
}
