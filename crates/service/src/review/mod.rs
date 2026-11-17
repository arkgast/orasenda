//! Reviews in the service (spec 2026-11-16): the daily shutdown, the weekly review and plan,
//! and the neutral stats. Later tasks append their modules here.

mod buffer;
mod emit;
mod state;
mod stats;
mod tomorrow;
mod view;
mod weekly;
pub(crate) mod words;

pub use buffer::run_buffer_suggestion_dismiss;
pub(crate) use emit::changed_view;
pub use emit::emit_changed;
pub(crate) use state::ReviewState;
pub use stats::run_review_stats;
pub(crate) use stats::stats_parts;
pub use view::{check_period, run_review_get};
pub use weekly::run_weekly_get;

#[cfg(test)]
mod tests;
