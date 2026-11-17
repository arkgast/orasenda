//! The shutdown's and the weekly review's words, and the two nudges.

use orasenda_core::{HourCycle, LocalDate};

/// What Rust knows about tomorrow, for the shutdown's read-only step.
pub(crate) struct Tomorrow {
    pub day: LocalDate,
    /// (minute of day, routine name), in time order.
    pub routines: Vec<(u16, String)>,
    pub due: Vec<String>,
    pub planned_sessions: u32,
    pub buffer: u8,
    pub priorities: Vec<String>,
    pub cycle: HourCycle,
}

/// "Ready when you are." or "Shutdown complete at 17:42."
pub(crate) fn shutdown_line(completed_minute: Option<u16>, cycle: HourCycle) -> String {
    todo!("{completed_minute:?} {cycle:?}")
}

/// The last step's confirmation: "Shutdown complete." or "Week planned."
pub(crate) fn completed_line(weekly: bool) -> &'static str {
    todo!("{weekly}")
}

/// The week's status: "Ready when you are." or "Week planned."
pub(crate) fn week_line(planned: bool) -> &'static str {
    todo!("{planned}")
}

/// "Fix sync bug · Doing", or "Fix sync bug · Done".
pub(crate) fn priority_line(title: &str, lane_label: &str, done: bool) -> String {
    todo!("{title} {lane_label} {done}")
}

/// The Tomorrow step, a line each.
pub(crate) fn tomorrow_lines(tomorrow: &Tomorrow) -> Vec<String> {
    todo!("{}", tomorrow.buffer)
}

/// "Moved 2 tasks to Backlog."
pub(crate) fn move_line(count: u32) -> String {
    todo!("{count}")
}

/// "Nothing unfinished."
pub(crate) fn nothing_unfinished() -> &'static str {
    todo!()
}

/// "That can't be undone now."
pub(crate) fn undo_expired() -> &'static str {
    todo!()
}

/// "Monday 16 to Friday 20 November".
pub(crate) fn look_back_heading(start: LocalDate, end: LocalDate) -> String {
    todo!("{start:?} {end:?}")
}

/// "Last week you chose: <their words>"
pub(crate) fn last_improvement(text: &str) -> String {
    todo!("{text}")
}

/// The `Period` error's line.
pub(crate) fn period_line() -> &'static str {
    todo!()
}

/// The shutdown nudge's body.
pub(crate) fn nudge_shutdown() -> &'static str {
    todo!()
}

/// The weekly nudge's body.
pub(crate) fn nudge_weekly() -> &'static str {
    todo!()
}

/// "Orasenda can't load your review right now."
pub(crate) fn load_failure() -> &'static str {
    todo!()
}

/// "Orasenda can't save your reflection right now."
pub(crate) fn save_failure() -> &'static str {
    todo!()
}
