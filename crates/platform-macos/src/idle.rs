//! Time since the last user input, from `CGEventSource` (no permission needed).

use objc2_core_graphics::{CGEventSource, CGEventSourceStateID, CGEventType};
use orasenda_core::platform::{IdleSource, PlatformError};

/// `kCGAnyInputEventType`: any mouse, keyboard or tablet event.
const ANY_INPUT_EVENT_TYPE: CGEventType = CGEventType(u32::MAX);

/// Reads idle time for the combined session state.
#[derive(Debug, Default, Clone, Copy)]
pub struct MacIdle;

impl IdleSource for MacIdle {
    fn idle_ms(&self) -> Result<u64, PlatformError> {
        let secs = CGEventSource::seconds_since_last_event_type(
            CGEventSourceStateID::CombinedSessionState,
            ANY_INPUT_EVENT_TYPE,
        );
        if !secs.is_finite() || secs < 0.0 {
            return Err(PlatformError::Other(format!("invalid idle time: {secs}")));
        }
        // Saturating float-to-int cast; idle time never approaches u64::MAX ms.
        Ok((secs * 1000.0) as u64)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idle_ms_is_available() {
        assert!(MacIdle.idle_ms().is_ok());
    }
}
