//! The seam between the publish steps and the app.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use orasenda_core::Notifier;
use orasenda_core::platform::import::{RemindersSource, ThingsSource};

use crate::api::{
    BoardNotice, BoardView, ClockTick, DataOverview, KeyboardView, MilestoneEvent, NoteView,
    PresetEntry, ReviewView, RoutinesView, Settings, Theme, TimerView,
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
    /// Emits `routines-changed`: the Routines page's view after a write, at local midnight or
    /// after an import. Never called under the service lock. An emit error is logged, never
    /// fatal.
    fn emit_routines_changed(&self, view: &RoutinesView);
    /// Emits `board-changed`: the whole board and a sequence number, the newest wins. Never
    /// called under the service lock. An emit error is logged, never fatal.
    fn emit_board_changed(&self, seq: u64, board: &BoardView);
    /// Emits `board-notice`: a toast line after a start moved or failed to move a task. Never
    /// called under the service lock. An emit error is logged, never fatal.
    fn emit_board_notice(&self, notice: &BoardNotice);
    /// Emits `review-changed`: the Review overview after a review write, and at local midnight
    /// and 04:00. Never called under the service lock. An emit error is logged, never fatal.
    fn emit_review_changed(&self, view: &ReviewView);
    /// Apple Reminders as an import source; `None` off macOS.
    fn reminders(&self) -> Option<Arc<dyn RemindersSource>> {
        None
    }
    /// Things as an import source; `None` off macOS.
    fn things(&self) -> Option<Arc<dyn ThingsSource>> {
        None
    }
}
