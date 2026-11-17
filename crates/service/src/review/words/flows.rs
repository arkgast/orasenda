//! The shutdown's and the weekly review's words, and the two nudges.

use orasenda_core::{HourCycle, LocalDate};

use super::{count, day_label, day_month};
use crate::routines::words::time_label;

/// What Rust knows about tomorrow, for the shutdown's read-only step.
pub(crate) struct Tomorrow {
    pub day: LocalDate,
    /// (minute of day, routine name), in time order; routines with no time come last.
    pub routines: Vec<(Option<u16>, String)>,
    pub due: Vec<String>,
    pub planned_sessions: u32,
    pub buffer: u8,
    pub priorities: Vec<String>,
    pub cycle: HourCycle,
}

/// "Ready when you are." or "Shutdown complete at 17:42."
pub(crate) fn shutdown_line(completed_minute: Option<u16>, cycle: HourCycle) -> String {
    match completed_minute {
        Some(minute) => format!("Shutdown complete at {}.", time_label(minute, cycle)),
        None => "Ready when you are.".to_owned(),
    }
}

/// The last step's confirmation: "Shutdown complete." or "Week planned."
pub(crate) fn completed_line(weekly: bool) -> &'static str {
    if weekly {
        "Week planned."
    } else {
        "Shutdown complete."
    }
}

/// The week's status: "Ready when you are." or "Week planned."
pub(crate) fn week_line(planned: bool) -> &'static str {
    if planned {
        "Week planned."
    } else {
        "Ready when you are."
    }
}

/// "Fix sync bug · Doing", or "Fix sync bug · Done".
pub(crate) fn priority_line(title: &str, lane_label: &str, done: bool) -> String {
    format!("{title} · {}", if done { "Done" } else { lane_label })
}

/// The Tomorrow step, a line each. The planned-sessions line is the Board footer's wording.
pub(crate) fn tomorrow_lines(tomorrow: &Tomorrow) -> Vec<String> {
    let mut lines = vec![format!("{}.", day_label(tomorrow.day))];
    if tomorrow.routines.is_empty() {
        lines.push("No routines scheduled.".to_owned());
    } else {
        let routines: Vec<String> = tomorrow
            .routines
            .iter()
            .map(|(minute, name)| match minute {
                Some(minute) => format!("{name} at {}", time_label(*minute, tomorrow.cycle)),
                None => format!("{name} (any time)"),
            })
            .collect();
        lines.push(format!("Routines: {}.", routines.join(", ")));
    }
    if tomorrow.due.is_empty() {
        lines.push("Nothing due.".to_owned());
    } else {
        lines.push(format!("Due: {}.", tomorrow.due.join(", ")));
    }
    if tomorrow.planned_sessions > 0 {
        lines.push(format!(
            "Planned {} with a {}% buffer",
            count(tomorrow.planned_sessions, "session", "sessions"),
            tomorrow.buffer
        ));
    }
    if !tomorrow.priorities.is_empty() {
        lines.push(format!(
            "Priorities this week: {}.",
            tomorrow.priorities.join(", ")
        ));
    }
    lines
}

/// "Moved 2 tasks to Backlog."
pub(crate) fn move_line(count_moved: u32) -> String {
    format!("Moved {} to Backlog.", count(count_moved, "task", "tasks"))
}

/// "Nothing unfinished."
pub(crate) fn nothing_unfinished() -> &'static str {
    "Nothing unfinished."
}

/// "That can't be undone now."
pub(crate) fn undo_expired() -> &'static str {
    "That can't be undone now."
}

/// "Monday 16 to Friday 20 November", or "Monday 30 November to Friday 4 December".
pub(crate) fn look_back_heading(start: LocalDate, end: LocalDate) -> String {
    let first = if start.month() == end.month() && start.year() == end.year() {
        format!("{} {}", start.weekday().name(), start.day())
    } else {
        format!("{} {}", start.weekday().name(), day_month(start))
    };
    format!("{first} to {} {}", end.weekday().name(), day_month(end))
}

/// "Last week you chose: <their words>"
pub(crate) fn last_improvement(text: &str) -> String {
    format!("Last week you chose: {text}")
}

/// The `Period` error's line.
pub(crate) fn period_line() -> &'static str {
    "This review is for an earlier day. Open Review again to see today."
}

/// The shutdown nudge's body.
pub(crate) fn nudge_shutdown() -> &'static str {
    "Ready to close the day when you are."
}

/// The weekly nudge's body.
pub(crate) fn nudge_weekly() -> &'static str {
    "Your weekly review is ready when you are."
}

/// "Orasenda can't load your review right now."
pub(crate) fn load_failure() -> &'static str {
    "Orasenda can't load your review right now."
}

/// "Orasenda can't save your reflection right now."
pub(crate) fn save_failure() -> &'static str {
    "Orasenda can't save your reflection right now."
}
