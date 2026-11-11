//! Every publish step of the session scheduler (spec: Scheduler).
//!
//! Once a second the app's `session-scheduler` thread calls [`iterate`]: it advances the
//! session under the lock, then, with the lock released, emits `clock-tick` and publishes the
//! session's [`Effects`](crate::session::Effects). Nothing here holds the service or
//! [`Surfaces`] lock while it emits, renders a surface or calls the [`Notifier`]. The thread
//! and the emits belong to the app, behind [`Host`].

use std::sync::{Arc, Mutex};

use orasenda_core::Notifier;

use crate::api::{ClockTick, MilestoneEvent, Settings, Theme, TimerView};
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
    /// Emits `timer-tick`. An emit error is logged, never fatal.
    fn emit_timer_tick(&self, view: &TimerView);
    /// Emits `timer-milestone`. An emit error is logged, never fatal.
    fn emit_milestone(&self, event: &MilestoneEvent);
    /// Emits `clock-tick`. An emit error is logged, never fatal.
    fn emit_clock_tick(&self, tick: &ClockTick);
    /// Emits `settings-changed`. An emit error is logged, never fatal.
    fn emit_settings_changed(&self, settings: &Settings);
    /// Applies the app-wide theme (`System` clears the override). Never called under the
    /// service lock.
    fn apply_theme(&self, theme: Theme);
}

mod publish;
#[cfg(test)]
mod tests;
mod tick;

#[cfg(test)]
use publish::apply_status;
pub use publish::{publish, publish_caught, publish_view, read_launch_status, store_status};
pub use tick::{iterate, publish_clock, publish_focus};
