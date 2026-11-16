use super::d;
use crate::review::days_done;

#[test]
fn days_done_whole_range() {
    let done = [d(2026, 11, 9), d(2026, 11, 10), d(2026, 11, 12)];
    let got = days_done(d(2026, 10, 1), d(2026, 11, 9), d(2026, 11, 15), &done);
    assert_eq!(got, (3, None));
}

#[test]
fn days_done_since_creation_mid_range() {
    let done = [d(2026, 11, 3), d(2026, 11, 4), d(2026, 11, 5), d(2026, 11, 6)];
    let got = days_done(d(2026, 11, 5), d(2026, 11, 2), d(2026, 11, 8), &done);
    assert_eq!(got, (2, Some(d(2026, 11, 5))));
}

#[test]
fn days_done_ignores_days_outside_the_range_and_repeats() {
    let done = [d(2026, 11, 8), d(2026, 11, 9), d(2026, 11, 9), d(2026, 11, 16)];
    let got = days_done(d(2026, 1, 1), d(2026, 11, 9), d(2026, 11, 15), &done);
    assert_eq!(got, (1, None));
}

#[test]
fn days_done_created_after_the_range_counts_nothing() {
    let got = days_done(d(2026, 11, 20), d(2026, 11, 9), d(2026, 11, 15), &[d(2026, 11, 10)]);
    assert_eq!(got, (0, None));
}
