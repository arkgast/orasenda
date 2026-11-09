//! The user's time zone offset and 12/24-hour preference from Foundation.

use objc2_foundation::{NSDate, NSDateFormatter, NSLocale, NSString, NSTimeZone, NSUserDefaults};
use orasenda_core::platform::{HourCycle, LocalTime};

/// Set by "24-hour time" in System Settings; absent until the user changes it.
const FORCE_24_HOUR_KEY: &str = "AppleICUForce24HourTime";
/// The skeleton for "the locale's preferred hour", resolved to `h a`, `HH` and so on.
const PREFERRED_HOUR_TEMPLATE: &str = "j";

/// Asks Foundation on every call and caches nothing itself (Foundation may cache the
/// current locale). Thread-safe: no AppKit, so any thread works.
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
/// locale's format for the `j` template: a set default wins, else [`format_hour_cycle`].
fn hour_cycle_from(force_24_hour: Option<bool>, template: Option<&str>) -> HourCycle {
    match force_24_hour {
        Some(true) => HourCycle::H23,
        Some(false) => HourCycle::H12,
        None => template.map_or(HourCycle::H23, format_hour_cycle),
    }
}

/// Classifies a date format by its hour field outside quoted literals: `h`/`K` are 12-hour,
/// `H`/`k` are 24-hour. Without an hour field, a period marker (`a`, or `B` as in zh_TW and
/// hi_IN) means 12-hour; otherwise 24-hour.
fn format_hour_cycle(format: &str) -> HourCycle {
    let mut in_literal = false;
    let mut has_period = false;
    for letter in format.chars() {
        // `'` opens and closes a literal; an escaped quote (`''`) toggles twice, so it
        // leaves the state unchanged.
        if letter == '\'' {
            in_literal = !in_literal;
            continue;
        }
        if in_literal {
            continue;
        }
        match letter {
            'h' | 'K' => return HourCycle::H12,
            'H' | 'k' => return HourCycle::H23,
            'a' | 'B' => has_period = true,
            _ => {}
        }
    }
    if has_period {
        HourCycle::H12
    } else {
        HourCycle::H23
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

    #[test]
    fn hour_cycle_helper_reads_the_hour_field_outside_quotes() {
        // 12-hour locales that mark the period with `B` (zh_TW, hi_IN) instead of `a`.
        assert_eq!(hour_cycle_from(None, Some("Bh時")), HourCycle::H12);
        assert_eq!(hour_cycle_from(None, Some("B h")), HourCycle::H12);
        assert_eq!(hour_cycle_from(None, Some("K a")), HourCycle::H12);
        assert_eq!(hour_cycle_from(None, Some("k")), HourCycle::H23);
        // Letters inside quoted literals are text, not fields.
        assert_eq!(hour_cycle_from(None, Some("HH 'h'")), HourCycle::H23);
        assert_eq!(hour_cycle_from(None, Some("H 'a'")), HourCycle::H23);
        assert_eq!(hour_cycle_from(None, Some("h 'o''clock'")), HourCycle::H12);
        // No hour field: the period marker decides, else 24-hour.
        assert_eq!(hour_cycle_from(None, Some("B")), HourCycle::H12);
        assert_eq!(hour_cycle_from(None, Some("'a'")), HourCycle::H23);
    }
}
