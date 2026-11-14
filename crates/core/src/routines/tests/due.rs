use crate::routines::{DUE_GRACE_MIN, Weekday, Weekdays, due_now};

const SEVEN: Option<u16> = Some(7 * 60);

fn due(time: Option<u16>, days: Weekdays, minute: u16) -> bool {
    due_now(time, days, Weekday::Monday, minute, false, false)
}

#[test]
fn due_from_the_minute_for_thirty_minutes() {
    assert_eq!(DUE_GRACE_MIN, 30);
    assert!(!due(SEVEN, Weekdays::EVERY_DAY, 419));
    assert!(due(SEVEN, Weekdays::EVERY_DAY, 420));
    assert!(due(SEVEN, Weekdays::EVERY_DAY, 449));
    assert!(!due(SEVEN, Weekdays::EVERY_DAY, 450));
}

#[test]
fn any_time_is_never_due() {
    assert!(!due(None, Weekdays::EVERY_DAY, 420));
}

#[test]
fn only_on_a_scheduled_weekday() {
    assert!(due(SEVEN, Weekdays::WEEKDAYS, 420));
    assert!(!due(SEVEN, Weekdays::WEEKENDS, 420));
}

#[test]
fn not_once_finished_or_nudged() {
    let days = Weekdays::EVERY_DAY;
    assert!(!due_now(SEVEN, days, Weekday::Monday, 425, true, false));
    assert!(!due_now(SEVEN, days, Weekday::Monday, 425, false, true));
}

#[test]
fn the_window_ends_at_midnight() {
    let late = Some(23 * 60 + 50);
    assert!(due(late, Weekdays::EVERY_DAY, 1439));
    assert!(!due(late, Weekdays::EVERY_DAY, 0));
    assert!(!due(late, Weekdays::EVERY_DAY, 5));
}

#[test]
fn out_of_range_values_are_never_due() {
    assert!(!due(Some(1440), Weekdays::EVERY_DAY, 1440));
    assert!(!due(SEVEN, Weekdays::EVERY_DAY, 2000));
}
