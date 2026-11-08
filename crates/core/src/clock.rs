//! Pure time helpers. Callers pass `SystemTime` in; core never reads the clock.

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
}
