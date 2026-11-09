//! The user's time zone offset and 12/24-hour preference from Foundation.

use objc2_foundation::{NSDate, NSDateFormatter, NSLocale, NSString, NSTimeZone, NSUserDefaults};
use orasenda_core::platform::{HourCycle, LocalTime};

/// Set by "24-hour time" in System Settings; absent until the user changes it.
const FORCE_24_HOUR_KEY: &str = "AppleICUForce24HourTime";
/// The skeleton for "the locale's preferred hour", resolved to `h a`, `HH` and so on.
const PREFERRED_HOUR_TEMPLATE: &str = "j";

/// Reads `NSTimeZone.localTimeZone` and the clock preference on every call, so changes in
/// System Settings apply without a restart. Thread-safe.
#[derive(Debug, Default, Clone, Copy)]
pub struct MacLocalTime;

impl LocalTime for MacLocalTime {
    fn utc_offset_min(&self, at_epoch_ms: u64) -> i32 {
        let date = NSDate::dateWithTimeIntervalSince1970(at_epoch_ms as f64 / 1000.0);
        let offset_secs = NSTimeZone::localTimeZone().secondsFromGMTForDate(&date);
        // Real offsets are within ±18 h, so the minutes always fit in an i32.
        (offset_secs / 60) as i32
    }

    fn hour_cycle(&self) -> HourCycle {
        let defaults = NSUserDefaults::standardUserDefaults();
        let key = NSString::from_str(FORCE_24_HOUR_KEY);
        let force_24_hour = defaults
            .objectForKey(&key)
            .map(|_| defaults.boolForKey(&key));
        let template = NSDateFormatter::dateFormatFromTemplate_options_locale(
            &NSString::from_str(PREFERRED_HOUR_TEMPLATE),
            0,
            Some(&NSLocale::currentLocale()),
        )
        .map(|format| format.to_string());
        hour_cycle_from(force_24_hour, template.as_deref())
    }
}

/// The hour cycle from the `AppleICUForce24HourTime` default (`None` when unset) and the
/// locale's format for the `j` template: a set default wins, else `a` (AM/PM) means 12-hour.
fn hour_cycle_from(force_24_hour: Option<bool>, template: Option<&str>) -> HourCycle {
    match force_24_hour {
        Some(true) => HourCycle::H23,
        Some(false) => HourCycle::H12,
        None if template.is_some_and(|format| format.contains('a')) => HourCycle::H12,
        None => HourCycle::H23,
    }
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use objc2_foundation::{NSDate, NSTimeZone};

    use super::*;

    const SIX_MONTHS_MS: u64 = 182 * 24 * 60 * 60 * 1000;

    fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64
    }

    /// The offset in minutes, computed straight from `NSTimeZone`.
    fn ns_time_zone_offset_min(at_epoch_ms: u64) -> i32 {
        let date = NSDate::dateWithTimeIntervalSince1970(at_epoch_ms as f64 / 1000.0);
        (NSTimeZone::localTimeZone().secondsFromGMTForDate(&date) / 60) as i32
    }

    #[test]
    fn local_time_offset_matches_ns_time_zone() {
        let now = now_ms();
        assert_eq!(
            MacLocalTime.utc_offset_min(now),
            ns_time_zone_offset_min(now)
        );
    }

    #[test]
    fn local_time_offset_at_dst_shifted_instant_matches_ns_time_zone() {
        let later = now_ms() + SIX_MONTHS_MS;
        assert_eq!(
            MacLocalTime.utc_offset_min(later),
            ns_time_zone_offset_min(later)
        );
    }

    #[test]
    fn hour_cycle_is_h12_or_h23() {
        assert!(matches!(
            MacLocalTime.hour_cycle(),
            HourCycle::H12 | HourCycle::H23
        ));
    }

    #[test]
    fn hour_cycle_helper_honours_force_24_hour_default() {
        // A set default wins over the locale's template.
        assert_eq!(hour_cycle_from(Some(true), Some("h a")), HourCycle::H23);
        assert_eq!(hour_cycle_from(Some(false), Some("HH")), HourCycle::H12);
        // Unset: the template decides.
        assert_eq!(hour_cycle_from(None, Some("h a")), HourCycle::H12);
        assert_eq!(hour_cycle_from(None, Some("HH")), HourCycle::H23);
        assert_eq!(hour_cycle_from(None, None), HourCycle::H23);
    }
}
