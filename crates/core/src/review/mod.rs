//! Review maths: weeks, the shutdown day, stats buckets, habit days and the buffer suggestion.
//!
//! Pure: no clock, no I/O. Callers pass the instant, the offset and the local date in. Weeks
//! start on Monday, like the habit dot grid.

mod buckets;
mod buffer;
mod habits;
mod week;

pub use buckets::{Bucket, StatsRange, focus_buckets};
pub use buffer::{Suggestion, suggest};
pub use habits::days_done;
pub use week::{look_back, planned_week, shutdown_day, week_start};

#[cfg(test)]
mod tests;
