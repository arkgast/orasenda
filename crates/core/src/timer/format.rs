//! Time strings every surface shows: the countdown digits, their spoken form and the wall clock.
//! Pure: the caller passes the instant, the UTC offset and the hour cycle.

use crate::platform::HourCycle;

const SECOND_MS: u64 = 1_000;
const MINUTE_S: u64 = 60;
const HOUR_S: u64 = 3_600;
const DAY_MS: i128 = 86_400_000;
const MINUTE_MS: i128 = 60_000;

/// Whole seconds left, rounded up so the digits reach zero only at the end.
fn ceil_seconds(ms: u64) -> u64 {
    ms.div_ceil(SECOND_MS)
}

/// Countdown digits: `MM:SS`, or `H:MM:SS` from 60 minutes up. Rounds up to the second.
pub fn format_remaining(ms: u64) -> String {
    let secs = ceil_seconds(ms);
    let (h, m, s) = (secs / HOUR_S, secs % HOUR_S / MINUTE_S, secs % MINUTE_S);
    if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    }
}

/// The countdown in words for VoiceOver ("24 minutes 59 seconds"), with the same rounding as
/// [`format_remaining`].
pub fn spoken_remaining(ms: u64) -> String {
    let secs = ceil_seconds(ms);
    let (h, m, s) = (secs / HOUR_S, secs % HOUR_S / MINUTE_S, secs % MINUTE_S);
    let parts: Vec<String> = [(h, "hour"), (m, "minute"), (s, "second")]
        .into_iter()
        .filter(|&(n, _)| n > 0)
        .map(|(n, unit)| {
            if n == 1 {
                format!("1 {unit}")
            } else {
                format!("{n} {unit}s")
            }
        })
        .collect();
    if parts.is_empty() {
        "0 seconds".to_owned()
    } else {
        parts.join(" ")
    }
}

/// A wall-clock time ("15:20" or "3:20 PM") for `epoch_ms`, shifted by `utc_offset_min`.
pub fn format_clock(epoch_ms: u64, utc_offset_min: i32, hour_cycle: HourCycle) -> String {
    // i128 holds any u64 instant plus any i32 offset in milliseconds without overflow.
    let local_ms = i128::from(epoch_ms) + i128::from(utc_offset_min) * MINUTE_MS;
    let minute_of_day = local_ms.rem_euclid(DAY_MS).div_euclid(MINUTE_MS);
    let (h, m) = (minute_of_day / 60, minute_of_day % 60);
    match hour_cycle {
        HourCycle::H23 => format!("{h:02}:{m:02}"),
        HourCycle::H12 => {
            let suffix = if h < 12 { "AM" } else { "PM" };
            let h12 = match h % 12 {
                0 => 12,
                other => other,
            };
            format!("{h12}:{m:02} {suffix}")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const S: u64 = 1_000;
    const MIN: u64 = 60 * S;
    const HOUR: u64 = 60 * MIN;

    #[test]
    fn format_remaining_rounds_up() {
        assert_eq!(format_remaining(0), "00:00");
        assert_eq!(format_remaining(1), "00:01");
        assert_eq!(format_remaining(999), "00:01");
        assert_eq!(format_remaining(1_000), "00:01");
        assert_eq!(format_remaining(1_001), "00:02");
        assert_eq!(format_remaining(59 * S), "00:59");
        assert_eq!(format_remaining(60 * S), "01:00");
        assert_eq!(format_remaining(25 * MIN), "25:00");
        assert_eq!(format_remaining(25 * MIN - 1), "25:00");
        assert_eq!(format_remaining(59 * MIN + 59 * S), "59:59");
        assert_eq!(format_remaining(59 * MIN + 59 * S + 1), "1:00:00");
        assert_eq!(format_remaining(HOUR), "1:00:00");
        assert_eq!(format_remaining(90 * MIN), "1:30:00");
        assert_eq!(format_remaining(3 * HOUR + 5 * S), "3:00:05");
    }

    #[test]
    fn format_remaining_never_panics_at_the_top_of_the_range() {
        assert!(format_remaining(u64::MAX).contains(':'));
        assert!(!spoken_remaining(u64::MAX).is_empty());
    }

    #[test]
    fn spoken_remaining_singular_and_plural() {
        assert_eq!(spoken_remaining(0), "0 seconds");
        assert_eq!(spoken_remaining(1), "1 second");
        assert_eq!(spoken_remaining(45 * S), "45 seconds");
        assert_eq!(spoken_remaining(MIN), "1 minute");
        assert_eq!(spoken_remaining(MIN + S), "1 minute 1 second");
        assert_eq!(spoken_remaining(2 * MIN), "2 minutes");
        assert_eq!(spoken_remaining(24 * MIN + 59 * S), "24 minutes 59 seconds");
        assert_eq!(
            spoken_remaining(24 * MIN + 58 * S + 1),
            "24 minutes 59 seconds"
        );
        assert_eq!(spoken_remaining(HOUR), "1 hour");
        assert_eq!(spoken_remaining(90 * MIN), "1 hour 30 minutes");
        assert_eq!(spoken_remaining(2 * HOUR + 5 * S), "2 hours 5 seconds");
        assert_eq!(spoken_remaining(HOUR + MIN + S), "1 hour 1 minute 1 second");
    }

    // 2026-11-09T15:20:00Z
    const T: u64 = 1_794_237_600_000;

    #[test]
    fn format_clock_h23_and_h12() {
        assert_eq!(format_clock(T, 0, HourCycle::H23), "15:20");
        assert_eq!(format_clock(T, 0, HourCycle::H12), "3:20 PM");
        assert_eq!(format_clock(T + 59_999, 0, HourCycle::H23), "15:20");
        assert_eq!(format_clock(T, 60, HourCycle::H23), "16:20");
        // 09:05 UTC
        let morning = T - 6 * HOUR - 15 * MIN;
        assert_eq!(format_clock(morning, 0, HourCycle::H23), "09:05");
        assert_eq!(format_clock(morning, 0, HourCycle::H12), "9:05 AM");
        // 12:30 UTC is noon in both cycles.
        let noon = T - 2 * HOUR - 50 * MIN;
        assert_eq!(format_clock(noon, 0, HourCycle::H23), "12:30");
        assert_eq!(format_clock(noon, 0, HourCycle::H12), "12:30 PM");
        assert_eq!(format_clock(0, 0, HourCycle::H23), "00:00");
    }

    #[test]
    fn format_clock_negative_offset() {
        // UTC-5 (New York in winter): 15:20Z is 10:20.
        assert_eq!(format_clock(T, -300, HourCycle::H23), "10:20");
        assert_eq!(format_clock(T, -300, HourCycle::H12), "10:20 AM");
        // Crossing back over midnight: 02:00Z at UTC-4 is 22:00 the day before.
        let two_am = T - 13 * HOUR - 20 * MIN;
        assert_eq!(format_clock(two_am, -240, HourCycle::H23), "22:00");
        assert_eq!(format_clock(two_am, -240, HourCycle::H12), "10:00 PM");
        // Before the epoch once shifted: still a valid time of day.
        assert_eq!(format_clock(0, -90, HourCycle::H23), "22:30");
        // Half-hour offsets (India, UTC+5:30).
        assert_eq!(format_clock(T, 330, HourCycle::H23), "20:50");
    }

    #[test]
    fn format_clock_h12_midnight_is_12_am() {
        let midnight = T - 15 * HOUR - 20 * MIN;
        assert_eq!(format_clock(midnight, 0, HourCycle::H12), "12:00 AM");
        assert_eq!(
            format_clock(midnight + 59 * MIN, 0, HourCycle::H12),
            "12:59 AM"
        );
        assert_eq!(format_clock(midnight - MIN, 0, HourCycle::H12), "11:59 PM");
        assert_eq!(format_clock(midnight, 0, HourCycle::H23), "00:00");
        assert_eq!(format_clock(midnight - MIN, 0, HourCycle::H23), "23:59");
        for h in 0..24 {
            let s = format_clock(midnight + h * HOUR, 0, HourCycle::H12);
            assert!(!s.starts_with("0:") && !s.starts_with("24:"), "{s}");
        }
    }

    #[test]
    fn format_clock_extreme_inputs_do_not_panic() {
        let _ = format_clock(u64::MAX, i32::MAX, HourCycle::H12);
        let _ = format_clock(0, i32::MIN, HourCycle::H23);
    }
}
