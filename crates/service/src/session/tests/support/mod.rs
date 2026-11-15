//! Fakes shared by the session, scheduler and app tests (a recording host, notifier,
//! keep-awake and local time on one ordered log) and the session tests' helpers.

mod fakes;
#[cfg(test)]
mod helpers;
mod import_fakes;

pub use fakes::*;
#[cfg(test)]
pub(crate) use helpers::*;
pub use import_fakes::*;
