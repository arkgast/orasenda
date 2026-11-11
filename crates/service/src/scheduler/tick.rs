//! The one-second iteration and the clock and focus publishes.

use std::panic::{self, AssertUnwindSafe};

use orasenda_core::EngineState;

use super::Host;
use super::publish::{publish, publish_view};
use crate::session::lock;

/// One scheduler iteration, inside `catch_unwind`: a panic is logged and the loop goes on.
/// A panic under the service lock poisons it; [`lock`] recovers it.
pub fn iterate<H: Host>(host: &H) {
    let step = panic::catch_unwind(AssertUnwindSafe(|| tick_once(host)));
    if step.is_err() {
        eprintln!("session-scheduler: an iteration panicked; continuing");
    }
}

/// Advance and take the clock under the lock; emit and publish after it.
fn tick_once<H: Host>(host: &H) {
    let Some(service) = host.service() else {
        return;
    };
    let now_ms = host.now_ms();
    let (effects, clock) = {
        let mut service = lock(service);
        let effects = service.tick(now_ms);
        (effects, service.clock_tick(now_ms))
    };
    host.emit_clock_tick(&clock);
    publish(host, effects);
}

/// Emits one `clock-tick` now.
pub fn publish_clock<H: Host>(host: &H) {
    let Some(service) = host.service() else {
        return;
    };
    let clock = lock(service).clock_tick(host.now_ms());
    host.emit_clock_tick(&clock);
}

/// On `Focused(true)`: one `clock-tick`, plus one `timer-tick` and a surface render while a
/// session is running or paused.
pub fn publish_focus<H: Host>(host: &H) {
    publish_clock(host);
    let Some(service) = host.service() else {
        return;
    };
    let (seq, view) = lock(service).snapshot(host.now_ms());
    if view.state != EngineState::Idle {
        publish_view(host, seq, &view);
    }
}
