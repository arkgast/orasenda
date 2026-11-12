//! Automatic steps: with auto-continue on, a focus that reaches its end keeps going.

use super::{EXTENSION_MS, Live};

impl Live {
    /// Takes one ten-minute step if the continuous focus stays within `longest_ms`. A step is
    /// an extension (the manual cap does not apply) and the warning comes again before its
    /// end. False, with nothing changed, at the limit.
    pub(crate) fn take_auto_step(&mut self, longest_ms: u64) -> bool {
        let next = self.planned_ms.saturating_add(EXTENSION_MS);
        if next > longest_ms {
            return false;
        }
        self.planned_ms = next;
        self.extensions = self.extensions.saturating_add(1);
        self.warned = false;
        self.auto_step = true;
        true
    }
}
