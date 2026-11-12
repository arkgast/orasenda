use super::*;
use crate::timer::{BreakKind, Phase};

const S: u64 = 1_000;
const MIN: u64 = 60 * S;
const H: u64 = 60 * MIN;
const T0: u64 = 1_794_237_600_000;
const LONG: u64 = 15 * MIN;

fn focus(start: u64, end: u64, completed: bool) -> DaySession {
    DaySession {
        quick: false,
        phase: Phase::Focus,
        break_kind: None,
        started_ms: start,
        ended_ms: end,
        focused_ms: end - start,
        completed,
    }
}

fn brk(start: u64, end: u64, kind: BreakKind) -> DaySession {
    DaySession {
        quick: false,
        phase: Phase::Break,
        break_kind: Some(kind),
        started_ms: start,
        ended_ms: end,
        focused_ms: end - start,
        completed: true,
    }
}

/// `n` completed 25-minute focus sessions, each followed by a short break, from `T0`.
fn rounds(n: u64) -> Vec<DaySession> {
    (0..n)
        .flat_map(|k| {
            let s = T0 + k * 30 * MIN;
            [
                focus(s, s + 25 * MIN, true),
                brk(s + 25 * MIN, s + 30 * MIN, BreakKind::Short),
            ]
        })
        .collect()
}

#[test]
fn first_focus_of_the_day_is_round_one() {
    assert_eq!(next_round(&[], T0, LONG), 1);
}

#[test]
fn completed_focus_adds_a_round() {
    let day = rounds(3);
    assert_eq!(next_round(&day, T0 + 90 * MIN, LONG), 4);
}

#[test]
fn next_round_ignores_quick_and_stopped() {
    let mut day = rounds(1);
    day.push(DaySession {
        quick: true,
        ..focus(T0 + 30 * MIN, T0 + 32 * MIN, true)
    });
    day.push(focus(T0 + 33 * MIN, T0 + 40 * MIN, false));
    assert_eq!(next_round(&day, T0 + 41 * MIN, LONG), 2);
}

#[test]
fn a_started_long_break_resets_the_chain_even_if_cut() {
    let mut day = rounds(3);
    let s = T0 + 90 * MIN;
    day.push(focus(s, s + 25 * MIN, true));
    day.push(brk(s + 25 * MIN, s + 27 * MIN, BreakKind::Long)); // skipped after 2 minutes
    assert_eq!(next_round(&day, s + 28 * MIN, LONG), 1);
    // A completed focus afterwards counts again.
    day.push(focus(s + 28 * MIN, s + 53 * MIN, true));
    day.push(brk(s + 53 * MIN, s + 58 * MIN, BreakKind::Short));
    assert_eq!(next_round(&day, s + 59 * MIN, LONG), 2);
}

#[test]
fn next_round_resets_after_gap_not_at_gap() {
    let day = rounds(2);
    let last_break_end = T0 + 60 * MIN;
    assert_eq!(next_round(&day, last_break_end + LONG, LONG), 3);
    assert_eq!(next_round(&day, last_break_end + LONG + 1, LONG), 1);
    // The gap is measured against the long break of the preset being started.
    assert_eq!(next_round(&day, last_break_end + LONG + 1, 30 * MIN), 3);
}

#[test]
fn no_break_yet_means_the_count_stands() {
    let day = vec![focus(T0, T0 + 25 * MIN, true)];
    assert_eq!(next_round(&day, T0 + 10 * H, LONG), 2);
}

#[test]
fn next_round_clock_set_back_no_panic() {
    let day = rounds(2);
    for now in [0, T0, T0 + 30 * MIN, T0 + 59 * MIN] {
        assert_eq!(next_round(&day, now, LONG), 3, "at {now}");
    }
    assert_eq!(next_round(&day, u64::MAX, LONG), 1);
    assert_eq!(next_round(&day, 0, u64::MAX), 3);
}

#[test]
fn next_round_saturates_at_255() {
    let day: Vec<DaySession> = (0..300).map(|k| focus(T0 + k, T0 + k + 1, true)).collect();
    assert_eq!(next_round(&day, T0, LONG), 255);
}

#[test]
fn focused_today_counts_every_focus_row_and_the_live_focus() {
    let mut day = rounds(2);
    day.push(DaySession {
        quick: true,
        ..focus(T0 + 60 * MIN, T0 + 62 * MIN, true)
    });
    day.push(focus(T0 + 63 * MIN, T0 + 70 * MIN, false));
    // 25 + 25 + 2 + 7 minutes of focus; the breaks do not count.
    assert_eq!(focused_today(&day, 0), 59 * MIN);
    assert_eq!(focused_today(&day, 4 * MIN), 63 * MIN);
    assert_eq!(focused_today(&[], u64::MAX), u64::MAX);
}

/// New York in 2026: UTC-5 until 07:00 UTC on 8 March, UTC-4 until 06:00 UTC on 1 November.
fn new_york(at_ms: u64) -> i32 {
    const SPRING: u64 = 1_772_953_200_000;
    const FALL: u64 = 1_793_512_800_000;
    if (SPRING..FALL).contains(&at_ms) {
        -240
    } else {
        -300
    }
}

#[test]
fn local_day_dst_23_and_25_hours() {
    // 8 March: local midnight 05:00 UTC to the next at 04:00 UTC.
    let (start, end) = local_day(1_772_960_000_000, new_york);
    assert_eq!((start, end), (1_772_946_000_000, 1_773_028_800_000));
    assert_eq!(end - start, 23 * H);
    // Before the shift on the same day gives the same day.
    assert_eq!(local_day(1_772_946_000_000, new_york), (start, end));
    // 1 November: 04:00 UTC to 05:00 UTC the next day.
    let (start, end) = local_day(1_793_520_000_000, new_york);
    assert_eq!((start, end), (1_793_505_600_000, 1_793_595_600_000));
    assert_eq!(end - start, 25 * H);
    // An ordinary day is 24 hours, and `now` is inside it.
    let now = 1_781_049_600_000 + 5 * H;
    let (start, end) = local_day(now, new_york);
    assert_eq!(end - start, 24 * H);
    assert!((start..end).contains(&now));
}

#[test]
fn local_day_never_panics_at_the_extremes() {
    for now in [0, 1, u64::MAX] {
        let (start, end) = local_day(now, |_| 14 * 60);
        assert!(start <= end);
        let (start, end) = local_day(now, |_| -12 * 60);
        assert!(start <= end);
    }
}

#[test]
fn session_name_fallback() {
    assert_eq!(session_name(None), "Deep focus");
    assert_eq!(session_name(Some("Outline chapter 3")), "Outline chapter 3");
}
