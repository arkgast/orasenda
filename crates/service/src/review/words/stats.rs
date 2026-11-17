//! The Stats page's and the look-back's words.

use orasenda_core::LocalDate;
use orasenda_core::review::StatsRange;

/// "2h 10m", "2h", "10m".
pub(crate) fn duration(minutes: u32) -> String {
    todo!("{minutes}")
}

/// "2 hours 10 minutes", "1 hour", "1 minute".
pub(crate) fn duration_spoken(minutes: u32) -> String {
    todo!("{minutes}")
}

/// "Focused for 2h 10m across 5 sessions."
pub(crate) fn focus_line(minutes: u32, sessions: u32) -> String {
    todo!("{minutes} {sessions}")
}

/// "You reached your 12h goal." or "9h 40m of a 12h goal."; `None` with no goal.
pub(crate) fn goal_line(minutes: u32, goal_minutes: u32) -> Option<String> {
    todo!("{minutes} {goal_minutes}")
}

/// "Goal 12h", and "Goal 12h, reached" once `minutes` meets the goal; `None` with no goal.
pub(crate) fn goal_words(minutes: u32, goal_minutes: u32) -> Option<String> {
    todo!("{minutes} {goal_minutes}")
}

/// "Tue", "16 Nov" or "Oct".
pub(crate) fn bar_label(range: StatsRange, start: LocalDate) -> String {
    todo!("{range:?} {start:?}")
}

/// "Tuesday 17 November, 2 hours 10 minutes" or "..., nothing recorded".
pub(crate) fn bar_spoken(range: StatsRange, start: LocalDate, minutes: u32) -> String {
    todo!("{range:?} {start:?} {minutes}")
}

/// "Fix sync bug, 2 hours 10 minutes".
pub(crate) fn task_spoken(title: &str, minutes: u32) -> String {
    todo!("{title} {minutes}")
}

/// "Monday 16 November".
pub(crate) fn day_label(date: LocalDate) -> String {
    todo!("{date:?}")
}

/// "Planning the week of 23 November".
pub(crate) fn week_label(week_start: LocalDate) -> String {
    todo!("{week_start:?}")
}

/// "October".
pub(crate) fn month_label(date: LocalDate) -> String {
    todo!("{date:?}")
}

/// "Done on 9 days this week.", or "Done on 9 days since 3 November." for a habit created
/// inside the range. Counts days done and never says "of N".
pub(crate) fn habit_line(days: u32, since: Option<LocalDate>, range: StatsRange) -> String {
    todo!("{days} {since:?} {range:?}")
}

/// "Wind-down: finished 6 times." Finished runs only.
pub(crate) fn routine_line(name: &str, finished: u32) -> String {
    todo!("{name} {finished}")
}

/// "Finished 4 tasks."
pub(crate) fn tasks_line(finished: u32) -> String {
    todo!("{finished}")
}

/// G1: "6 finished tasks had an estimate: 14 sessions planned, 17 sessions of 5 minutes or
/// more." `None` when no task qualifies.
pub(crate) fn estimate_line(tasks: u32, planned: u32, actual: u32) -> Option<String> {
    todo!("{tasks} {planned} {actual}")
}

/// The buffer suggestion's sentence.
pub(crate) fn buffer_line(tasks: u32, planned: u32, actual: u32, percent: u8) -> String {
    todo!("{tasks} {planned} {actual} {percent}")
}

/// "Use 40%".
pub(crate) fn buffer_action(percent: u8) -> String {
    todo!("{percent}")
}

/// What an empty range says: nothing at all yet, or nothing in this range.
pub(crate) fn empty_line(no_data_yet: bool) -> &'static str {
    todo!("{no_data_yet}")
}
