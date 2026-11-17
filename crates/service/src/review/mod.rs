//! Reviews in the service (spec 2026-11-16): the daily shutdown, the weekly review and plan,
//! and the neutral stats. Later tasks append their modules here.

mod emit;
mod state;
mod view;
pub(crate) mod words;

pub(crate) use emit::changed_view;
pub use emit::emit_changed;
pub(crate) use state::ReviewState;
pub use view::{check_period, run_review_get};
mod buffer;
mod stats;

pub use buffer::run_buffer_suggestion_dismiss;
pub use stats::run_review_stats;
pub(crate) use stats::stats_parts;

#[cfg(test)]
mod tests;
