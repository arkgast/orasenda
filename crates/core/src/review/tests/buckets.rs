use super::{at, d};
use crate::review::{Bucket, StatsRange, focus_buckets};
use crate::routines::LocalDate;

const MIN: u64 = 60_000;

fn starts(buckets: &[Bucket]) -> Vec<LocalDate> {
    buckets.iter().map(|bucket| bucket.start).collect()
}

#[test]
fn buckets_week_marks_future_days() {
    let today = d(2026, 11, 18);
    let sessions = [(d(2026, 11, 16), 25 * MIN), (d(2026, 11, 16), 30 * MIN)];
    let got = focus_buckets(&sessions, StatsRange::Week, today);
    assert_eq!(got.len(), 7);
    assert_eq!(got[0].start, d(2026, 11, 16));
    assert_eq!(got[6].start, d(2026, 11, 22));
    assert_eq!((got[0].minutes, got[0].sessions), (55, 2));
    let future: Vec<bool> = got.iter().map(|bucket| bucket.future).collect();
    assert_eq!(future, [false, false, false, true, true, true, true]);
    assert!(got[3..].iter().all(|b| b.minutes == 0 && b.sessions == 0));
}

#[test]
fn buckets_week_on_sunday_and_monday() {
    let sunday = focus_buckets(&[], StatsRange::Week, d(2026, 11, 22));
    assert!(sunday.iter().all(|bucket| !bucket.future));
    let monday = focus_buckets(&[], StatsRange::Week, d(2026, 11, 16));
    assert_eq!(monday.iter().filter(|bucket| bucket.future).count(), 6);
}

#[test]
fn buckets_weeks8_anchor() {
    let today = d(2026, 11, 18);
    let sessions = [
        (d(2026, 9, 27), 10 * MIN),
        (d(2026, 9, 28), 20 * MIN),
        (d(2026, 11, 15), 30 * MIN),
        (d(2026, 11, 16), 40 * MIN),
    ];
    let got = focus_buckets(&sessions, StatsRange::Weeks8, today);
    assert_eq!(got.len(), 8);
    assert_eq!(got[0].start, d(2026, 9, 28));
    assert_eq!(got[7].start, d(2026, 11, 16));
    assert_eq!(got[0].minutes, 20, "the Sunday before the first week is outside");
    assert_eq!(got[6].minutes, 30, "Sunday belongs to the week before");
    assert_eq!(got[7].minutes, 40);
    assert!(got.iter().all(|bucket| !bucket.future));
}

#[test]
fn buckets_months6_month_edge() {
    let today = d(2026, 11, 18);
    let sessions = [(d(2026, 10, 31), 10 * MIN), (d(2026, 11, 1), 20 * MIN)];
    let got = focus_buckets(&sessions, StatsRange::Months6, today);
    assert_eq!(starts(&got)[0], d(2026, 6, 1));
    assert_eq!(got[4].minutes, 10, "31 October");
    assert_eq!(got[5].minutes, 20, "1 November");
}

#[test]
fn months6_crosses_year_end() {
    let got = focus_buckets(&[], StatsRange::Months6, d(2027, 2, 10));
    let expected = [
        d(2026, 9, 1),
        d(2026, 10, 1),
        d(2026, 11, 1),
        d(2026, 12, 1),
        d(2027, 1, 1),
        d(2027, 2, 1),
    ];
    assert_eq!(starts(&got), expected);
}

#[test]
fn buckets_current_flag() {
    for range in [StatsRange::Week, StatsRange::Weeks8, StatsRange::Months6] {
        let got = focus_buckets(&[], range, d(2026, 11, 18));
        let current: Vec<usize> = (0..got.len()).filter(|i| got[*i].current).collect();
        let expected = match range {
            StatsRange::Week => vec![2],
            StatsRange::Weeks8 => vec![7],
            StatsRange::Months6 => vec![5],
        };
        assert_eq!(current, expected, "{range:?}");
    }
}

#[test]
fn buckets_round_minutes_down_after_summing() {
    let sessions = [(d(2026, 11, 16), 90_000), (d(2026, 11, 16), 90_000)];
    let got = focus_buckets(&sessions, StatsRange::Week, d(2026, 11, 16));
    assert_eq!((got[0].minutes, got[0].sessions), (3, 2));
}

#[test]
fn buckets_dst_moves_near_midnight_session() {
    // 23:30 on the 16th at +01:00 is 00:30 on the 17th once the offset is +02:00.
    let instant = at(d(2026, 11, 16), 23, 30, 60);
    let today = d(2026, 11, 18);
    let bucket_of = |offset| {
        let day = LocalDate::from_epoch_ms(instant, offset);
        let got = focus_buckets(&[(day, 25 * MIN)], StatsRange::Week, today);
        got.iter().position(|bucket| bucket.sessions == 1)
    };
    assert_eq!(bucket_of(60), Some(0));
    assert_eq!(bucket_of(120), Some(1), "today's offset moves it one day");
}

#[test]
fn buckets_travel_offset_moves_session() {
    // 22:00 on the 22nd in Lisbon (+00:00) is 07:00 on the 23rd in Tokyo (+09:00): a new week.
    let instant = at(d(2026, 11, 22), 22, 0, 0);
    let today = d(2026, 11, 24);
    let weeks = |offset| {
        let day = LocalDate::from_epoch_ms(instant, offset);
        let got = focus_buckets(&[(day, 25 * MIN)], StatsRange::Weeks8, today);
        got.iter().position(|bucket| bucket.sessions == 1)
    };
    assert_eq!(weeks(0), Some(6));
    assert_eq!(weeks(540), Some(7));
}
