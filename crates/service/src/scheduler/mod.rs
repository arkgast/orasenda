//! Every publish step of the session scheduler (spec: Scheduler).
//!
//! Once a second the app's `session-scheduler` thread calls [`iterate`]: it advances the
//! session under the lock, then, with the lock released, emits `clock-tick` and publishes the
//! session's [`Effects`](crate::session::Effects). Nothing here holds the service or
//! [`Surfaces`] lock while it emits, renders a surface or calls the [`Notifier`]. The thread
//! and the emits belong to the app, behind [`Host`].

#[cfg(test)]
use crate::api::{MilestoneEvent, TimerView};
#[cfg(test)]
use crate::session::SessionService;

mod host;
mod publish;
#[cfg(test)]
mod tests;
mod tick;

pub use host::Host;
#[cfg(test)]
use publish::apply_status;
pub use publish::{publish, publish_caught, publish_view, read_launch_status, store_status};
pub use tick::{iterate, publish_clock, publish_focus};
