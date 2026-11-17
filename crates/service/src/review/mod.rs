//! Reviews in the service (spec 2026-11-16): the daily shutdown, the weekly review and plan,
//! and the neutral stats. Later tasks append their modules here.

mod buffer;
mod emit;
mod shutdown;
mod nudge;
mod state;
mod stats;
mod tomorrow;
mod undo;
mod view;
mod weekly;
pub(crate) mod words;

pub use buffer::run_buffer_suggestion_dismiss;
pub(crate) use emit::changed_view;
pub use emit::emit_changed;
pub use shutdown::{run_shutdown_complete, run_shutdown_get};
pub(crate) use state::ReviewState;
pub use stats::run_review_stats;
pub(crate) use stats::stats_parts;
pub use undo::{run_shutdown_move, run_shutdown_move_undo};
pub use nudge::nudge_due;
pub(crate) use state::{NudgeKind, ReviewState};
pub use view::{check_period, run_review_get};
pub use weekly::run_weekly_get;
pub use weekly::{run_weekly_complete, run_weekly_save};

#[cfg(test)]
mod tests;
