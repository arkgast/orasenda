use super::d;
use crate::routines::{LocalDate, Weekday, minute_of_day};

const DAY_MS: u64 = 86_400_000;

#[test]
fn new_refuses_impossible_dates() {
    assert!(LocalDate::new(2026, 2, 29).is_none());
    assert!(LocalDate::new(2028, 2, 29).is_some());
    assert!(LocalDate::new(1900, 2, 29).is_none());
    assert!(LocalDate::new(2000, 2, 29).is_some());
    assert!(LocalDate::new(2026, 4, 31).is_none());
    assert!(LocalDate::new(2026, 13, 1).is_none());
    assert!(LocalDate::new(2026, 0, 1).is_none());
    assert!(LocalDate::new(2026, 1, 0).is_none());
}

#[test]
fn from_epoch_ms_reads_the_local_date() {
    assert_eq!(LocalDate::from_epoch_ms(0, 0), d(1970, 1, 1));
    // 2026-11-14T00:00:00Z.
    let midnight_utc = 1_794_614_400_000;
    assert_eq!(LocalDate::from_epoch_ms(midnight_utc, 0), d(2026, 11, 14));
    // One minute before UTC midnight, but already the next day in Tokyo (+09:00).
    assert_eq!(
        LocalDate::from_epoch_ms(midnight_utc - 60_000, 9 * 60),
        d(2026, 11, 14)
    );
    // Shortly after UTC midnight, still the evening before in New York (-05:00).
    assert_eq!(
        LocalDate::from_epoch_ms(midnight_utc + 60_000, -5 * 60),
        d(2026, 11, 13)
    );
    // Before the epoch in local time never panics.
    assert_eq!(LocalDate::from_epoch_ms(0, -60), d(1969, 12, 31));
}

#[test]
fn minute_of_day_is_local() {
    let midnight_utc = 1_794_614_400_000;
    assert_eq!(minute_of_day(midnight_utc, 0), 0);
    assert_eq!(
        minute_of_day(midnight_utc + 7 * 3_600_000 + 5 * 60_000, 0),
        425
    );
    assert_eq!(minute_of_day(midnight_utc, -5 * 60), 19 * 60);
    assert_eq!(minute_of_day(midnight_utc - 60_000, 0), 1439);
}

#[test]
fn weekday_of_known_dates() {
    assert_eq!(d(1970, 1, 1).weekday(), Weekday::Thursday);
    assert_eq!(d(2026, 11, 14).weekday(), Weekday::Saturday);
    assert_eq!(d(2026, 11, 9).weekday(), Weekday::Monday);
    assert_eq!(d(2026, 11, 15).weekday(), Weekday::Sunday);
    assert_eq!(d(2028, 2, 29).weekday(), Weekday::Tuesday);
}

#[test]
fn succ_and_pred_cross_month_and_year_ends() {
    assert_eq!(d(2026, 1, 31).succ(), d(2026, 2, 1));
    assert_eq!(d(2026, 2, 28).succ(), d(2026, 3, 1));
    assert_eq!(d(2028, 2, 28).succ(), d(2028, 2, 29));
    assert_eq!(d(2028, 2, 29).succ(), d(2028, 3, 1));
    assert_eq!(d(2026, 12, 31).succ(), d(2027, 1, 1));
    assert_eq!(d(2027, 1, 1).pred(), d(2026, 12, 31));
    assert_eq!(d(2028, 3, 1).pred(), d(2028, 2, 29));
    assert_eq!(d(2026, 3, 1).pred(), d(2026, 2, 28));
    assert_eq!(d(2026, 5, 1).pred(), d(2026, 4, 30));
}

#[test]
fn succ_and_pred_agree_with_epoch_days_over_years() {
    let mut day = d(2023, 12, 25);
    for n in 0..1_200u64 {
        let ms = (u64::try_from(day.days_since_epoch()).unwrap()) * DAY_MS;
        assert_eq!(LocalDate::from_epoch_ms(ms, 0), day, "day {n}");
        assert_eq!(day.succ().pred(), day);
        day = day.succ();
    }
}

#[test]
fn iso_round_trip() {
    for date in [
        d(2026, 11, 14),
        d(2028, 2, 29),
        d(1999, 12, 31),
        d(2027, 1, 1),
    ] {
        let iso = date.to_iso();
        assert_eq!(LocalDate::parse_iso(&iso), Some(date), "{iso}");
    }
    assert_eq!(d(2026, 3, 7).to_iso(), "2026-03-07");
}

#[test]
fn parse_iso_refuses_anything_else() {
    for bad in [
        "",
        "2026-11",
        "2026-11-1",
        "2026-1-14",
        "26-11-14",
        "2026/11/14",
        "2026-11-14T00:00",
        "2026-02-29",
        "2026-13-01",
        "abcd-ef-gh",
        " 2026-11-14",
        "+026-11-14",
    ] {
        assert_eq!(LocalDate::parse_iso(bad), None, "{bad:?}");
    }
}

#[test]
fn dates_order_by_time() {
    assert!(d(2026, 12, 31) < d(2027, 1, 1));
    assert!(d(2026, 2, 28) < d(2026, 3, 1));
    assert!(d(2026, 11, 9) < d(2026, 11, 10));
}

#[test]
fn label_names_the_weekday_day_and_month() {
    assert_eq!(d(2026, 11, 9).label(), "Monday 9 November");
    assert_eq!(d(2027, 1, 1).label(), "Friday 1 January");
}

#[test]
fn weekday_words() {
    assert_eq!(Weekday::Monday.short(), "Mon");
    assert_eq!(Weekday::Sunday.name(), "Sunday");
    assert_eq!(Weekday::ALL.len(), 7);
    assert_eq!(Weekday::ALL[0], Weekday::Monday);
}
