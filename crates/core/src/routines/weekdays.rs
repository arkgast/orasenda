//! The weekday mask a routine or standalone habit runs on: Monday = 1 … Sunday = 64.

use super::Weekday;

/// A non-empty set of weekdays (1–127).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Weekdays(u8);

impl Weekdays {
    pub const EVERY_DAY: Weekdays = Weekdays(127);
    /// Monday to Friday.
    pub const WEEKDAYS: Weekdays = Weekdays(31);
    /// Saturday and Sunday.
    pub const WEEKENDS: Weekdays = Weekdays(96);

    /// The mask, or `None` when it is empty or has a bit above Sunday.
    pub fn from_bits(bits: u8) -> Option<Self> {
        (1..=127).contains(&bits).then_some(Self(bits))
    }

    pub fn bits(self) -> u8 {
        self.0
    }

    pub fn contains(self, day: Weekday) -> bool {
        self.0 & day.bit() != 0
    }

    /// The days in the set, Monday first.
    pub fn days(self) -> impl Iterator<Item = Weekday> {
        Weekday::ALL
            .into_iter()
            .filter(move |&day| self.contains(day))
    }

    /// "Every day", "Weekdays", "Weekends" or the short names: "Mon, Wed, Fri".
    pub fn label(self) -> String {
        match self {
            Self::EVERY_DAY => "Every day".to_owned(),
            Self::WEEKDAYS => "Weekdays".to_owned(),
            Self::WEEKENDS => "Weekends".to_owned(),
            _ => self
                .days()
                .map(Weekday::short)
                .collect::<Vec<_>>()
                .join(", "),
        }
    }
}
