//! Window frames: the store calls, the in-memory fallback and the `run_frame_*` functions.
//!
//! A frame whose write fails (or that has no store to go to) is kept in
//! [`SessionService::frames`] for this run, and read from there first: it is newer than
//! anything stored. Nothing is shown to the user, because nothing they asked for failed.

use orasenda_store::window_frames::{self, StoredFrame};

use super::*;
use crate::scheduler::Host;
use crate::windows::Frame;

fn from_stored(stored: StoredFrame) -> Option<Frame> {
    Some(Frame {
        x: i32::try_from(stored.x).ok()?,
        y: i32::try_from(stored.y).ok()?,
        width: u32::try_from(stored.width).ok()?,
        height: u32::try_from(stored.height).ok()?,
    })
}

fn to_stored(frame: Frame) -> StoredFrame {
    StoredFrame {
        x: i64::from(frame.x),
        y: i64::from(frame.y),
        width: i64::from(frame.width),
        height: i64::from(frame.height),
    }
}

fn key(window: &str, display: &str) -> (String, String) {
    (window.to_owned(), display.to_owned())
}

impl SessionService {
    /// The frame of `window` on `display`: this run's unsaved one, else the stored one. A
    /// failed read is logged and answers `None`.
    pub fn frame_get(&self, window: &str, display: &str) -> Option<Frame> {
        if let Some(frame) = self.frames.get(&key(window, display)) {
            return Some(*frame);
        }
        let store = self.store.as_ref()?;
        match store.read(|txn| window_frames::get(txn, window, display)) {
            Ok(stored) => stored.and_then(from_stored),
            Err(error) => {
                eprintln!("frames: {window} on {display} could not be read ({error})");
                None
            }
        }
    }

    /// The frame to reopen `window` at, with its display's key: an unsaved one of this run
    /// for the first listed display that has one, else the stored frame on the connected
    /// display written most recently.
    pub fn frame_load(&self, window: &str, displays: &[&str]) -> Option<(String, Frame)> {
        if let Some((display, frame)) = displays.iter().find_map(|display| {
            self.frames
                .get(&key(window, display))
                .map(|frame| (*display, *frame))
        }) {
            return Some((display.to_owned(), frame));
        }
        let store = self.store.as_ref()?;
        match store.read(|txn| window_frames::latest(txn, window, displays)) {
            Ok(found) => found.and_then(|(display, stored)| Some((display, from_stored(stored)?))),
            Err(error) => {
                eprintln!("frames: {window} could not be loaded ({error})");
                None
            }
        }
    }

    /// Remembers a frame. A failed or impossible write is logged and kept in memory for this
    /// run; a successful one drops any older in-memory copy.
    pub fn frame_save(&mut self, window: &str, display: &str, frame: Frame, now_ms: u64) {
        let written = match &self.store {
            Some(store) => store
                .write(now_ms, |txn| {
                    window_frames::put(txn, window, display, to_stored(frame), now_ms)
                })
                .map_err(|error| error.to_string()),
            None => Err("there is no store".to_owned()),
        };
        match written {
            Ok(()) => {
                self.frames.remove(&key(window, display));
            }
            Err(error) => {
                eprintln!("frames: {window} on {display} not saved ({error}); kept for this run");
                self.frames.insert(key(window, display), frame);
            }
        }
    }
}

/// The frame to reopen `window` at, with its display's key. `None` before setup.
pub fn run_frame_load<H: Host>(
    host: &H,
    window: &str,
    displays: &[&str],
) -> Option<(String, Frame)> {
    lock(host.service()?).frame_load(window, displays)
}

/// The frame of `window` on `display`. `None` before setup.
pub fn run_frame_get<H: Host>(host: &H, window: &str, display: &str) -> Option<Frame> {
    lock(host.service()?).frame_get(window, display)
}

/// Remembers the frame of `window` on `display`. Before setup it is dropped, logged.
pub fn run_frame_save<H: Host>(host: &H, window: &str, display: &str, frame: Frame) {
    match host.service() {
        Some(service) => lock(service).frame_save(window, display, frame, host.now_ms()),
        None => eprintln!("frames: {window} on {display} not saved; the session is not set up"),
    }
}
