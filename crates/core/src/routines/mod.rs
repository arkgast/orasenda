//! Routines and habits: local dates, weekday masks, the dot-grid tracker, the due rule and the
//! five starter templates. Pure; no clock, no I/O. Callers pass the local date and minute in.

mod date;
pub mod due;
pub mod templates;
pub mod tracker;
mod weekdays;

pub use date::{LocalDate, Weekday, minute_of_day};
pub use due::{DUE_GRACE_MIN, due_now};
pub use templates::{Template, TemplateId, TemplateStep};
pub use tracker::{DayDot, DayState, day_states, fresh_start, run_of_days};
pub use weekdays::Weekdays;

#[cfg(test)]
mod tests;
