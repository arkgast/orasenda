use crate::routines::{Weekday, Weekdays};

#[test]
fn masks_follow_monday_first() {
    assert_eq!(Weekday::Monday.bit(), 1);
    assert_eq!(Weekday::Sunday.bit(), 64);
    assert_eq!(Weekdays::EVERY_DAY.bits(), 127);
    assert_eq!(Weekdays::WEEKDAYS.bits(), 31);
    assert_eq!(Weekdays::WEEKENDS.bits(), 96);
}

#[test]
fn from_bits_keeps_one_to_127() {
    assert_eq!(Weekdays::from_bits(0), None);
    assert_eq!(Weekdays::from_bits(128), None);
    assert_eq!(Weekdays::from_bits(255), None);
    assert_eq!(Weekdays::from_bits(1).map(Weekdays::bits), Some(1));
    assert_eq!(Weekdays::from_bits(127), Some(Weekdays::EVERY_DAY));
}

#[test]
fn contains() {
    assert!(Weekdays::WEEKDAYS.contains(Weekday::Friday));
    assert!(!Weekdays::WEEKDAYS.contains(Weekday::Saturday));
    assert!(Weekdays::WEEKENDS.contains(Weekday::Sunday));
    for day in Weekday::ALL {
        assert!(Weekdays::EVERY_DAY.contains(day));
    }
}

#[test]
fn labels() {
    assert_eq!(Weekdays::EVERY_DAY.label(), "Every day");
    assert_eq!(Weekdays::WEEKDAYS.label(), "Weekdays");
    assert_eq!(Weekdays::WEEKENDS.label(), "Weekends");
    let mwf = Weekdays::from_bits(1 | 4 | 16).unwrap();
    assert_eq!(mwf.label(), "Mon, Wed, Fri");
    assert_eq!(Weekdays::from_bits(64).unwrap().label(), "Sun");
    assert_eq!(Weekdays::from_bits(1 | 64).unwrap().label(), "Mon, Sun");
    assert_eq!(
        Weekdays::from_bits(63).unwrap().label(),
        "Mon, Tue, Wed, Thu, Fri, Sat"
    );
}

#[test]
fn days_lists_them_in_order() {
    let mwf = Weekdays::from_bits(1 | 4 | 16).unwrap();
    assert_eq!(
        mwf.days().collect::<Vec<_>>(),
        vec![Weekday::Monday, Weekday::Wednesday, Weekday::Friday]
    );
}
