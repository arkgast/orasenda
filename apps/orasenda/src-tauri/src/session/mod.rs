//! The session service: the engine, the store and the platform behind one lock (ADR-013).
//!
//! Every surface (the webview, the menu bar) acts through [`run_action`] and sees the same
//! [`TimerView`]. The service never emits, renders, notifies or drops a keep-awake guard
//! itself: [`SessionService::apply`], [`SessionService::tick`] and [`SessionService::state`]
//! fill [`Effects`], which [`crate::scheduler::publish`] carries out after the lock is released.

mod actions;
mod effects;
mod persist;
mod recovery;
mod service;
mod settings;
mod setup;
#[cfg(test)]
mod tests;
mod view;

pub use effects::Effects;
pub use service::{Action, NativeSurface, Platform, SessionService, Surfaces, ViewGate};
pub(crate) use setup::{current_settings, flush_on_exit, now_ms, run_set_settings, run_state};
pub use setup::{lock, run_action, setup};
#[cfg(test)]
pub(crate) use setup::{open_store_at, run_action_on};
/// Fakes shared by the session and scheduler tests.
#[cfg(test)]
pub(crate) use tests::support as test_support;

use effects::Outcome;
use recovery::{RecoverOwed, RowFound, recovered, unread_row};
use settings::read_settings;
#[cfg(test)]
use settings::{KEY_CUSTOM, KEY_NOTIFY, KEY_PRESET, KEY_THEME, META_NOTIFY_REVIEW};
