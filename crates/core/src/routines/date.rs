//! Local calendar dates and weekdays, computed from an instant and a UTC offset passed in.
//!
//! The day arithmetic is the proleptic Gregorian calendar (Howard Hinnant's `days_from_civil`).

const MINUTE_MS: i128 = 60_000;
const DAY_MS: i128 = 86_400_000;

const MONTHS: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

/// A day of the week. Weeks start on Monday (the weekday mask's bit 0).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Weekday {
    Monday,
    Tuesday,
    Wednesday,
    Thursday,
    Friday,
    Saturday,
    Sunday,
}

impl Weekday {
    /// Monday to Sunday.
    pub const ALL: [Weekday; 7] = [
        Weekday::Monday,
        Weekday::Tuesday,
        Weekday::Wednesday,
        Weekday::Thursday,
        Weekday::Friday,
        Weekday::Saturday,
        Weekday::Sunday,
    ];

    /// 0 for Monday to 6 for Sunday.
    pub fn index(self) -> u8 {
        self as u8
    }

    /// This day's bit in a weekday mask: Monday = 1 … Sunday = 64.
    pub fn bit(self) -> u8 {
        1 << self.index()
    }

    /// "Mon".
    pub fn short(self) -> &'static str {
        &self.name()[..3]
    }

    /// "Monday".
    pub fn name(self) -> &'static str {
        match self {
            Weekday::Monday => "Monday",
            Weekday::Tuesday => "Tuesday",
            Weekday::Wednesday => "Wednesday",
            Weekday::Thursday => "Thursday",
            Weekday::Friday => "Friday",
            Weekday::Saturday => "Saturday",
            Weekday::Sunday => "Sunday",
        }
    }
}

/// A local calendar date. Orders by time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct LocalDate {
    year: i32,
    month: u8,
    day: u8,
}

impl LocalDate {
    /// The date, or `None` when it doesn't exist (30 February, month 13).
    pub fn new(year: i32, month: u8, day: u8) -> Option<Self> {
        let valid = (1..=12).contains(&month) && day >= 1 && day <= days_in_month(year, month);
        valid.then_some(Self { year, month, day })
    }

    /// The local date at `epoch_ms`, for a zone `offset_min` minutes east of UTC.
    pub fn from_epoch_ms(epoch_ms: u64, offset_min: i32) -> Self {
        let local = i128::from(epoch_ms) + i128::from(offset_min) * MINUTE_MS;
        // |local / DAY_MS| < 2^44, so it fits in an i64.
        Self::from_days(i64::try_from(local.div_euclid(DAY_MS)).unwrap_or(0))
    }

    pub fn year(self) -> i32 {
        self.year
    }

    pub fn month(self) -> u8 {
        self.month
    }

    pub fn day(self) -> u8 {
        self.day
    }

    /// Days since 1970-01-01 (negative before it).
    pub fn days_since_epoch(self) -> i64 {
        let y = i64::from(self.year) - i64::from(self.month <= 2);
        let era = y.div_euclid(400);
        let yoe = y - era * 400;
        let m = i64::from(self.month);
        let mp = (m + 9) % 12;
        let doy = (153 * mp + 2) / 5 + i64::from(self.day) - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146_097 + doe - 719_468
    }

    fn from_days(days: i64) -> Self {
        let z = days + 719_468;
        let era = z.div_euclid(146_097);
        let doe = z - era * 146_097;
        let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let day = doy - (153 * mp + 2) / 5 + 1;
        let month = if mp < 10 { mp + 3 } else { mp - 9 };
        let year = yoe + era * 400 + i64::from(month <= 2);
        Self {
            year: i32::try_from(year).unwrap_or(i32::MAX),
            // month is 1–12 and day 1–31 by construction.
            month: u8::try_from(month).unwrap_or(1),
            day: u8::try_from(day).unwrap_or(1),
        }
    }

    pub fn weekday(self) -> Weekday {
        // 1970-01-01 was a Thursday (index 3).
        let index = (self.days_since_epoch() + 3).rem_euclid(7);
        Weekday::ALL[usize::try_from(index).unwrap_or(0)]
    }

    /// The day before.
    pub fn pred(self) -> Self {
        Self::from_days(self.days_since_epoch() - 1)
    }

    /// The day after.
    pub fn succ(self) -> Self {
        Self::from_days(self.days_since_epoch() + 1)
    }

    /// "2026-11-14".
    pub fn to_iso(self) -> String {
        format!("{:04}-{:02}-{:02}", self.year, self.month, self.day)
    }

    /// Reads exactly `YYYY-MM-DD`; anything else, or a date that doesn't exist, is `None`.
    pub fn parse_iso(text: &str) -> Option<Self> {
        let bytes = text.as_bytes();
        let shape_ok = bytes.len() == 10
            && bytes[4] == b'-'
            && bytes[7] == b'-'
            && bytes
                .iter()
                .enumerate()
                .all(|(i, b)| i == 4 || i == 7 || b.is_ascii_digit());
        if !shape_ok {
            return None;
        }
        let year = text[..4].parse().ok()?;
        let month = text[5..7].parse().ok()?;
        let day = text[8..].parse().ok()?;
        Self::new(year, month, day)
    }

    /// "Monday 9 November", for a dot's VoiceOver label.
    pub fn label(self) -> String {
        let month = MONTHS[usize::from(self.month - 1)];
        format!("{} {} {month}", self.weekday().name(), self.day)
    }
}

/// Minutes after local midnight at `epoch_ms` (0–1439), for a zone `offset_min` east of UTC.
pub fn minute_of_day(epoch_ms: u64, offset_min: i32) -> u16 {
    let local = i128::from(epoch_ms) + i128::from(offset_min) * MINUTE_MS;
    u16::try_from(local.rem_euclid(DAY_MS) / MINUTE_MS).unwrap_or(0)
}

fn is_leap(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(year: i32, month: u8) -> u8 {
    match month {
        2 if is_leap(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}
