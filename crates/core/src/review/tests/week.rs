use super::{at, d};
use crate::review::{look_back, planned_week, shutdown_day, week_start};

#[test]
fn week_start_sunday_monday_year_end() {
    assert_eq!(week_start(d(2026, 11, 15)), d(2026, 11, 9), "Sunday");
    assert_eq!(week_start(d(2026, 11, 16)), d(2026, 11, 16), "Monday");
    assert_eq!(
        week_start(d(2027, 1, 1)),
        d(2026, 12, 28),
        "across the year end"
    );
    assert_eq!(
        week_start(d(2027, 1, 3)),
        d(2026, 12, 28),
        "Sunday across the year end"
    );
}

#[test]
fn planned_week_each_weekday() {
    for day in 16..=19 {
        assert_eq!(
            planned_week(d(2026, 11, day)),
            d(2026, 11, 16),
            "Mon to Thu: this week"
        );
    }
    for day in 20..=22 {
        assert_eq!(
            planned_week(d(2026, 11, day)),
            d(2026, 11, 23),
            "Fri to Sun: next week"
        );
    }
}

#[test]
fn look_back_is_the_week_before_the_planned_week() {
    assert_eq!(
        look_back(d(2026, 11, 16)),
        (d(2026, 11, 9), d(2026, 11, 15))
    );
    assert_eq!(look_back(d(2027, 1, 4)), (d(2026, 12, 28), d(2027, 1, 3)));
}

#[test]
fn shutdown_day_0359_and_0400() {
    let next = d(2026, 11, 17);
    assert_eq!(shutdown_day(at(next, 3, 59, 60), 60), d(2026, 11, 16));
    assert_eq!(shutdown_day(at(next, 4, 0, 60), 60), next);
    assert_eq!(shutdown_day(at(next, 0, 40, 60), 60), d(2026, 11, 16));
    assert_eq!(shutdown_day(at(next, 23, 59, 60), 60), next);
}

#[test]
fn shutdown_day_dst_offsets() {
    let instant = at(d(2026, 11, 17), 3, 30, 60);
    assert_eq!(
        shutdown_day(instant, 60),
        d(2026, 11, 16),
        "03:30 at +01:00"
    );
    assert_eq!(
        shutdown_day(instant, 120),
        d(2026, 11, 17),
        "04:30 at +02:00"
    );
    let west = at(d(2026, 11, 17), 3, 59, -480);
    assert_eq!(shutdown_day(west, -480), d(2026, 11, 16), "west of UTC");
    assert_eq!(shutdown_day(west, -420), d(2026, 11, 17), "04:59 at -07:00");
}
