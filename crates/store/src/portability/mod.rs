//! Data portability: a consistent copy of the live database, a read-only look at a foreign file,
//! and live row counts (spec 2026-11-12, sub-project G).

mod probe;
mod snapshot;
mod stats;
#[cfg(test)]
mod tests;

pub use probe::{Probe, ProbeError, probe};
pub use stats::{Counts, counts};
