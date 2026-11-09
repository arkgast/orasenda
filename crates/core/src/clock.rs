//! Pure time helpers. Callers pass `SystemTime` in; core never reads the clock.

use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const ONE_SECOND: Duration = Duration::from_secs(1);

/// Time from `now` until the next whole wall-clock second, in (0, 1 s].
///
/// Exactly 1 s when `now` is on a second boundary. Never panics, also for instants before
/// the Unix epoch.
pub fn delay_to_next_second(now: SystemTime) -> Duration {
    match now.duration_since(UNIX_EPOCH) {
        Ok(since) => ONE_SECOND - Duration::from_nanos(u64::from(since.subsec_nanos())),
        // Before the epoch, the next whole second is `before`'s whole-second part.
        Err(err) => match err.duration().subsec_nanos() {
            0 => ONE_SECOND,
            nanos => Duration::from_nanos(u64::from(nanos)),
        },
    }
}

/// Milliseconds since the Unix epoch. Instants before the epoch saturate to 0.
pub fn epoch_ms(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH).map_or(0, |since| {
        u64::try_from(since.as_millis()).unwrap_or(u64::MAX)
    })
}

/// A hybrid logical clock stamp. The string form sorts in causal order.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HlcStamp {
    pub wall_ms: u64,
    pub counter: u16,
    pub device_id: String,
}

impl std::fmt::Display for HlcStamp {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{:013}-{:05}-{}",
            self.wall_ms, self.counter, self.device_id
        )
    }
}

/// A stamp string that does not parse.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParseHlcStampError;

impl std::fmt::Display for ParseHlcStampError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("not a valid clock stamp")
    }
}

impl std::error::Error for ParseHlcStampError {}

impl std::str::FromStr for HlcStamp {
    type Err = ParseHlcStampError;

    fn from_str(s: &str) -> Result<HlcStamp, ParseHlcStampError> {
        let mut parts = s.splitn(3, '-');
        let (Some(wall), Some(counter), Some(device)) = (parts.next(), parts.next(), parts.next())
        else {
            return Err(ParseHlcStampError);
        };
        Ok(HlcStamp {
            wall_ms: wall.parse().map_err(|_| ParseHlcStampError)?,
            counter: counter.parse().map_err(|_| ParseHlcStampError)?,
            device_id: device.to_owned(),
        })
    }
}

impl Ord for HlcStamp {
    fn cmp(&self, other: &HlcStamp) -> std::cmp::Ordering {
        self.to_string().cmp(&other.to_string())
    }
}

impl PartialOrd for HlcStamp {
    fn partial_cmp(&self, other: &HlcStamp) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

/// Hybrid logical clock. The caller passes wall time in; stamps never go backwards.
#[derive(Debug, Clone)]
pub struct Hlc {
    wall_ms: u64,
    counter: u16,
    device_id: String,
}

impl Hlc {
    pub fn new(device_id: String) -> Hlc {
        Hlc {
            wall_ms: 0,
            counter: 0,
            device_id,
        }
    }

    /// Continues after `last`, so the next stamp sorts after it.
    pub fn restore(last: &HlcStamp) -> Hlc {
        Hlc {
            wall_ms: last.wall_ms,
            counter: last.counter,
            device_id: last.device_id.clone(),
        }
    }

    /// The next stamp. An equal or backward `now_ms` bumps the counter; a full counter
    /// bumps `wall_ms` by one instead.
    pub fn tick(&mut self, now_ms: u64) -> HlcStamp {
        if now_ms > self.wall_ms {
            self.wall_ms = now_ms;
            self.counter = 0;
        } else if let Some(next) = self.counter.checked_add(1) {
            self.counter = next;
        } else {
            self.wall_ms += 1;
            self.counter = 0;
        }
        HlcStamp {
            wall_ms: self.wall_ms,
            counter: self.counter,
            device_id: self.device_id.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(secs: u64, nanos: u32) -> SystemTime {
        UNIX_EPOCH + Duration::new(secs, nanos)
    }

    const NOV_7_2026: u64 = 1_794_009_600;

    #[test]
    fn delay_is_one_second_on_exact_boundary() {
        assert_eq!(
            delay_to_next_second(at(NOV_7_2026, 0)),
            Duration::from_secs(1)
        );
    }

    #[test]
    fn delay_mid_second() {
        assert_eq!(
            delay_to_next_second(at(NOV_7_2026, 500_000_000)),
            Duration::from_millis(500)
        );
    }

    #[test]
    fn delay_at_999ms_is_1ms() {
        assert_eq!(
            delay_to_next_second(at(NOV_7_2026, 999_000_000)),
            Duration::from_millis(1)
        );
    }

    #[test]
    fn delay_at_unix_epoch() {
        assert_eq!(delay_to_next_second(UNIX_EPOCH), Duration::from_secs(1));
    }

    #[test]
    fn delay_before_epoch_does_not_panic() {
        // 0.25 s before the epoch: the next whole second is the epoch itself.
        let t = UNIX_EPOCH - Duration::from_millis(250);
        assert_eq!(delay_to_next_second(t), Duration::from_millis(250));
        let t = UNIX_EPOCH - Duration::from_secs(3);
        assert_eq!(delay_to_next_second(t), Duration::from_secs(1));
    }

    #[test]
    fn delay_always_in_open_zero_to_one_second() {
        let offsets = (0..1_000u32)
            .map(|ms| ms * 1_000_000)
            .chain([1, 999_999_999, 123_456_789]);
        for nanos in offsets {
            for t in [at(NOV_7_2026, nanos), UNIX_EPOCH - Duration::new(7, nanos)] {
                let d = delay_to_next_second(t);
                assert!(
                    d > Duration::ZERO && d <= Duration::from_secs(1),
                    "{nanos} ns gave {d:?}"
                );
            }
        }
    }

    #[test]
    fn epoch_ms_of_known_instant() {
        assert_eq!(epoch_ms(at(NOV_7_2026, 123_456_789)), 1_794_009_600_123);
        assert_eq!(epoch_ms(UNIX_EPOCH), 0);
    }

    #[test]
    fn epoch_ms_before_epoch_is_zero() {
        assert_eq!(epoch_ms(UNIX_EPOCH - Duration::from_secs(1)), 0);
    }

    fn clock(now: &[u64]) -> Vec<HlcStamp> {
        let mut h = Hlc::new("dev".into());
        now.iter().map(|n| h.tick(*n)).collect()
    }

    fn assert_increasing(stamps: &[HlcStamp]) {
        for w in stamps.windows(2) {
            assert!(w[0] < w[1], "{} !< {}", w[0], w[1]);
            assert!(w[0].to_string() < w[1].to_string());
        }
    }

    #[test]
    fn hlc_strictly_increasing_across_equal_wall_times() {
        assert_increasing(&clock(&[1000, 1000, 1000, 1001]));
    }

    #[test]
    fn hlc_strictly_increasing_across_backward_wall_times() {
        let s = clock(&[5000, 4000, 3000, 5000, 6000]);
        assert_increasing(&s);
        assert_eq!(s[1].wall_ms, 5000);
    }

    #[test]
    fn hlc_stamps_sort_as_strings() {
        let mut s = clock(&[1, 1, 2, 1, 100]);
        let mut by_string = s.clone();
        by_string.sort_by_key(|x| x.to_string());
        s.sort();
        assert_eq!(s, by_string);
    }

    #[test]
    fn hlc_stamps_sort_as_strings_across_counter_9999_to_10000() {
        let mut h = Hlc::new("d".into());
        let stamps: Vec<_> = (0..10_005).map(|_| h.tick(7)).collect();
        assert_eq!(stamps[9_999].counter, 9_999);
        assert_eq!(stamps[10_000].counter, 10_000);
        assert_increasing(&stamps);
    }

    #[test]
    fn hlc_counter_saturation_bumps_wall_ms() {
        let mut h = Hlc::restore(&HlcStamp {
            wall_ms: 50,
            counter: u16::MAX,
            device_id: "d".into(),
        });
        let s = h.tick(10);
        assert_eq!((s.wall_ms, s.counter), (51, 0));
    }

    #[test]
    fn hlc_stamp_round_trips_from_str() {
        let s = HlcStamp {
            wall_ms: 1_794_009_600_123,
            counter: 42,
            device_id: "mac-1".into(),
        };
        assert_eq!(s.to_string(), "1794009600123-00042-mac-1");
        assert_eq!(s.to_string().parse::<HlcStamp>(), Ok(s));
        assert!("garbage".parse::<HlcStamp>().is_err());
    }

    #[test]
    fn hlc_restore_continues_after_last() {
        let mut a = Hlc::new("d".into());
        let last = a.tick(900);
        let mut b = Hlc::restore(&last);
        assert!(b.tick(100) > last);
        assert!(b.tick(900) > last);
    }
}
