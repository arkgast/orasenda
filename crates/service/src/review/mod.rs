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

#[cfg(test)]
mod tests;
