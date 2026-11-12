//! Window frames: the store calls, the in-memory fallback and the `run_frame_*` functions.

use super::*;
use crate::scheduler::Host;
use crate::windows::Frame;

impl SessionService {
    /// The frame of `window` on `display`.
    pub fn frame_get(&self, _window: &str, _display: &str) -> Option<Frame> {
        todo!()
    }

    /// The frame to reopen `window` at: the connected display's newest.
    pub fn frame_load(&self, _window: &str, _displays: &[&str]) -> Option<(String, Frame)> {
        todo!()
    }

    /// Remembers a frame.
    pub fn frame_save(&mut self, _window: &str, _display: &str, _frame: Frame, _now_ms: u64) {
        todo!()
    }
}

/// The frame to reopen `window` at, with its display's key.
pub fn run_frame_load<H: Host>(
    _host: &H,
    _window: &str,
    _displays: &[&str],
) -> Option<(String, Frame)> {
    todo!()
}

/// The frame of `window` on `display`.
pub fn run_frame_get<H: Host>(_host: &H, _window: &str, _display: &str) -> Option<Frame> {
    todo!()
}

/// Remembers the frame of `window` on `display`.
pub fn run_frame_save<H: Host>(_host: &H, _window: &str, _display: &str, _frame: Frame) {
    todo!()
}
