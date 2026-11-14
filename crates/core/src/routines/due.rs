//! When a routine is due for its one nudge.

use super::{Weekday, Weekdays};

/// How long after its time a routine stays due, in minutes.
pub const DUE_GRACE_MIN: u16 = 30;

/// True from the minute of `time_of_day` until `DUE_GRACE_MIN` minutes after it (the window
/// never runs past local midnight), on a scheduled weekday, and only while the routine is
/// neither finished nor already nudged today. A routine with no time (*Any time*) is never due.
pub fn due_now(
    time_of_day: Option<u16>,
    days: Weekdays,
    today: Weekday,
    local_minute: u16,
    finished_today: bool,
    nudged_today: bool,
) -> bool {
    let Some(start) = time_of_day else {
        return false;
    };
    let in_window = local_minute >= start && local_minute - start < DUE_GRACE_MIN;
    in_window && local_minute < 1440 && days.contains(today) && !finished_today && !nudged_today
}
