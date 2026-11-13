//! The Tauri-side runtime: the session glue, the ticker thread and the emit helpers.

pub(crate) mod events;
pub(crate) mod keyboard;
#[cfg(desktop)]
pub(crate) mod recording;
#[cfg(all(test, desktop))]
mod recording_tests;
pub(crate) mod session;
pub(crate) mod ticker;
