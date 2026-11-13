//! The session service: the engine, the store and the platform behind one lock (ADR-013).
//!
//! Every surface (the webview, the menu bar) acts through [`run_action_on`] and sees the same
//! [`TimerView`](crate::api::TimerView). The service never emits, renders, notifies or drops a keep-awake guard
//! itself: [`SessionService::apply`], [`SessionService::tick`] and [`SessionService::state`]
//! fill [`Effects`], which [`crate::scheduler::publish`] carries out after the lock is released.

mod actions;
mod cadence;
mod day_cache;
mod effects;
mod frames;
mod full_screen_hint;
mod hint;
mod persist;
mod presets;
mod recovery;
mod run;
mod service;
mod settings;
#[cfg(test)]
mod tests;
mod tips;
mod view;

pub use effects::{Effects, Notice};
pub use frames::{run_frame_get, run_frame_load, run_frame_migrate, run_frame_save};
pub use full_screen_hint::{
    FULL_SCREEN_HINT_ENTRIES, run_full_screen_entered, run_full_screen_hints_left,
};
pub(crate) use presets::edit::MAX_PRESETS;
pub(crate) use presets::resolve;
pub(crate) use run::DB_FILE;
pub use run::{
    current_settings, flush_on_exit, lock, open_store_at, run_action_on, run_preset_add,
    run_preset_remove, run_preset_undo_remove, run_preset_update, run_presets_list,
    run_presets_restore_defaults, run_select_preset, run_set_settings, run_state, run_view,
};
pub use service::{Action, NativeSurface, Platform, SessionService, Surfaces, ViewGate};
pub(crate) use settings::KEY_PRESET;
pub use settings::SettingsSaved;
/// Fakes shared by the session, scheduler and app tests.
#[cfg(any(test, feature = "test-support"))]
#[path = "tests/support/mod.rs"]
pub mod test_support;

use effects::Outcome;
use presets::snapshot_of;
use recovery::{RecoverOwed, RowFound, recovered, unread_row};
use run::new_session_id;
use settings::read_settings;
#[cfg(test)]
use settings::{KEY_NOTIFY, KEY_THEME, META_NOTIFY_REVIEW};
