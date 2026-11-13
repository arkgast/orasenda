//! The full-screen key hints: how many of the first entries are left to show them. The count
//! is a device-only `meta` row (`hint.full_screen_keys`, `"0"` to `"3"`), bumped by Rust on
//! did-enter so an entry counts even when the person leaves before the hint fades. Like the
//! tips, learning the keys happens on one Mac, and a count that changes on every entry would
//! fill `change_log` for nothing.

use orasenda_store::meta;

use super::*;
use crate::scheduler::Host;

/// The `meta` key holding the number of entries that showed the hints.
pub(super) const META_FULL_SCREEN_KEYS: &str = "hint.full_screen_keys";

/// How many entries show the hints.
pub const FULL_SCREEN_HINT_ENTRIES: u8 = 3;

/// A stored value as a count. A missing row is none; anything else that is not `0..=3` reads
/// as 3, so a bad value means "learned" and never shows hints again.
fn parse_count(value: Option<&str>) -> u8 {
    match value {
        None => 0,
        Some(text) => text
            .parse::<u8>()
            .ok()
            .filter(|count| *count <= FULL_SCREEN_HINT_ENTRIES)
            .unwrap_or(FULL_SCREEN_HINT_ENTRIES),
    }
}

impl SessionService {
    /// The stored count; `None` when there is no store or the read fails (logged).
    fn full_screen_count(&self) -> Option<u8> {
        let store = self.store.as_ref()?;
        match store.read(|txn| meta::get(txn, META_FULL_SCREEN_KEYS)) {
            Ok(value) => Some(parse_count(value.as_deref())),
            Err(error) => {
                eprintln!("hint: {META_FULL_SCREEN_KEYS} could not be read ({error}); no hints");
                None
            }
        }
    }

    /// Entries left that show the hints. 0 when the count can't be read: a hint that might
    /// repeat is never shown.
    pub fn full_screen_hints_left(&self) -> u8 {
        self.full_screen_count()
            .map_or(0, |count| FULL_SCREEN_HINT_ENTRIES - count)
    }

    /// Main entered full screen: counts the entry while under 3 and returns the entries left
    /// *before* the count, so the first entry returns 3. When the count can't be read or
    /// written, returns 0 (no hints this time).
    pub fn note_full_screen_entered(&mut self, now_ms: u64) -> u8 {
        let Some(count) = self.full_screen_count() else {
            return 0;
        };
        let left = FULL_SCREEN_HINT_ENTRIES - count;
        if left == 0 {
            return 0;
        }
        let next = (count + 1).to_string();
        if let Err(error) =
            self.write_owed(now_ms, |txn| meta::set(txn, META_FULL_SCREEN_KEYS, &next))
        {
            eprintln!("hint: could not remember {META_FULL_SCREEN_KEYS} ({error}); no hints");
            return 0;
        }
        left
    }
}

/// `window_view`'s hint count: entries left, under a brief lock. 0 before setup.
pub fn run_full_screen_hints_left<H: Host>(host: &H) -> u8 {
    host.service()
        .map_or(0, |service| lock(service).full_screen_hints_left())
}

/// Counts a full-screen entry (on a blocking thread, never the main thread) and returns the
/// entries left before it.
pub fn run_full_screen_entered<H: Host>(host: &H) -> u8 {
    host.service().map_or(0, |service| {
        lock(service).note_full_screen_entered(host.now_ms())
    })
}

#[cfg(test)]
mod count_tests {
    use super::parse_count;

    #[test]
    fn counts_parse_and_bad_values_read_as_done() {
        assert_eq!(parse_count(None), 0);
        assert_eq!(parse_count(Some("0")), 0);
        assert_eq!(parse_count(Some("2")), 2);
        assert_eq!(parse_count(Some("3")), 3);
        for bad in ["4", "-1", "x", "", "99999"] {
            assert_eq!(parse_count(Some(bad)), 3, "{bad}");
        }
    }
}
