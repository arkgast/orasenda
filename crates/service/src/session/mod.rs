//! The session service: the engine, the store and the platform behind one lock (ADR-013).
//!
//! Every surface (the webview, the menu bar) acts through [`run_action_on`] and sees the same
//! [`TimerView`](crate::api::TimerView). The service never emits, renders, notifies or drops a keep-awake guard
//! itself: [`SessionService::apply`], [`SessionService::tick`] and [`SessionService::state`]
//! fill [`Effects`], which [`crate::scheduler::publish`] carries out after the lock is released.

mod actions;
mod effects;
mod persist;
mod recovery;
mod run;
mod service;
mod settings;
#[cfg(test)]
mod tests;
mod view;

pub use effects::Effects;
pub use run::{
    current_settings, flush_on_exit, lock, now_ms, open_store_at, run_action_on, run_set_settings,
    run_state,
};
pub use service::{Action, NativeSurface, Platform, SessionService, Surfaces, ViewGate};
/// Fakes shared by the session, scheduler and app tests.
#[cfg(any(test, feature = "test-support"))]
#[path = "tests/support/mod.rs"]
pub mod test_support;

use effects::Outcome;
use recovery::{RecoverOwed, RowFound, recovered, unread_row};
use settings::read_settings;
#[cfg(test)]
use settings::{KEY_CUSTOM, KEY_NOTIFY, KEY_PRESET, KEY_THEME, META_NOTIFY_REVIEW};
