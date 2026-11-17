//! The Stats page's and the look-back's words.

use orasenda_core::LocalDate;
use orasenda_core::review::StatsRange;

use super::{count, day_month, month_name};

/// "2h 10m", "2h", "10m".
pub(crate) fn duration(minutes: u32) -> String {
    match (minutes / 60, minutes % 60) {
        (0, m) => format!("{m}m"),
        (h, 0) => format!("{h}h"),
        (h, m) => format!("{h}h {m}m"),
    }
}

/// "2 hours 10 minutes", "1 hour", "1 minute".
pub(crate) fn duration_spoken(minutes: u32) -> String {
    let (hours, rest) = (minutes / 60, minutes % 60);
    match (hours, rest) {
        (0, m) => count(m, "minute", "minutes"),
        (h, 0) => count(h, "hour", "hours"),
        (h, m) => format!(
            "{} {}",
            count(h, "hour", "hours"),
            count(m, "minute", "minutes")
        ),
    }
}

/// "Focused for 2h 10m across 5 sessions."
pub(crate) fn focus_line(minutes: u32, sessions: u32) -> String {
    format!(
        "Focused for {} across {}.",
        duration(minutes),
        count(sessions, "session", "sessions")
    )
}

/// "You reached your 12h goal." or "9h 40m of a 12h goal."; `None` with no goal.
pub(crate) fn goal_line(minutes: u32, goal_minutes: u32) -> Option<String> {
    if goal_minutes == 0 {
        return None;
    }
    let goal = duration(goal_minutes);
    Some(if minutes >= goal_minutes {
        format!("You reached your {goal} goal.")
    } else {
        format!("{} of a {goal} goal.", duration(minutes))
    })
}

/// "Goal 12h", and "Goal 12h, reached" once `minutes` meets the goal; `None` with no goal.
pub(crate) fn goal_words(minutes: u32, goal_minutes: u32) -> Option<String> {
    if goal_minutes == 0 {
        return None;
    }
    let reached = if minutes >= goal_minutes {
        ", reached"
    } else {
        ""
    };
    Some(format!("Goal {}{reached}", duration(goal_minutes)))
}

/// "Tue", "16 Nov" or "Oct"; "Today", "This week" or "This month" for the current bar.
pub(crate) fn bar_label(range: StatsRange, start: LocalDate, current: bool) -> String {
    if current {
        return match range {
            StatsRange::Week => "Today",
            StatsRange::Weeks8 => "This week",
            StatsRange::Months6 => "This month",
        }
        .to_owned();
    }
    let month = &month_name(start)[..3];
    match range {
        StatsRange::Week => start.weekday().short().to_owned(),
        StatsRange::Weeks8 => format!("{} {month}", start.day()),
        StatsRange::Months6 => month.to_owned(),
    }
}

/// "Tuesday 17 November, 2 hours 10 minutes" or "..., nothing recorded".
pub(crate) fn bar_spoken(range: StatsRange, start: LocalDate, minutes: u32) -> String {
    let name = match range {
        StatsRange::Week => day_label(start),
        StatsRange::Weeks8 => format!("Week of {}", day_month(start)),
        StatsRange::Months6 => month_label(start),
    };
    amount(&name, minutes)
}

/// "Fix sync bug, 2 hours 10 minutes".
pub(crate) fn task_spoken(title: &str, minutes: u32) -> String {
    amount(title, minutes)
}

/// "Monday 16 November".
pub(crate) fn day_label(date: LocalDate) -> String {
    date.label()
}

/// "Planning the week of 23 November".
pub(crate) fn week_label(week_start: LocalDate) -> String {
    format!("Planning the week of {}", day_month(week_start))
}

/// "October".
pub(crate) fn month_label(date: LocalDate) -> String {
    month_name(date).to_owned()
}

/// "Done on 9 days this week.", or "Done on 9 days since 3 November." for a habit created
/// inside the range. Counts days done and never says "of N".
pub(crate) fn habit_line(days: u32, since: Option<LocalDate>, range: StatsRange) -> String {
    let span = match (since, range) {
        (Some(created), _) => format!("since {}", day_month(created)),
        (None, StatsRange::Week) => "this week".to_owned(),
        (None, StatsRange::Weeks8) => "in these 8 weeks".to_owned(),
        (None, StatsRange::Months6) => "in these 6 months".to_owned(),
    };
    if days == 0 {
        return format!("No check-ins {span}.");
    }
    format!("Done on {} {span}.", count(days, "day", "days"))
}

/// "Wind-down: finished 6 times." Finished runs only.
pub(crate) fn routine_line(name: &str, finished: u32) -> String {
    match finished {
        0 => format!("{name}: no finished runs."),
        1 => format!("{name}: finished once."),
        n => format!("{name}: finished {n} times."),
    }
}

/// "Finished 4 tasks."
pub(crate) fn tasks_line(finished: u32) -> String {
    match finished {
        0 => "No tasks finished.".to_owned(),
        n => format!("Finished {}.", count(n, "task", "tasks")),
    }
}

/// G1: "6 finished tasks had an estimate: 14 sessions planned, 17 sessions of 5 minutes or
/// more." `None` when no task qualifies.
pub(crate) fn estimate_line(tasks: u32, planned: u32, actual: u32) -> Option<String> {
    (tasks > 0).then(|| {
        format!(
            "{} had an estimate: {} planned, {} of 5 minutes or more.",
            count(tasks, "finished task", "finished tasks"),
            count(planned, "session", "sessions"),
            count(actual, "session", "sessions"),
        )
    })
}

/// The buffer suggestion's sentence.
pub(crate) fn buffer_line(tasks: u32, planned: u32, actual: u32, percent: u8) -> String {
    format!(
        "{}: {} planned, {} of 5 minutes or more. A {percent}% buffer would fit these.",
        count(tasks, "finished task", "finished tasks"),
        count(planned, "session", "sessions"),
        count(actual, "session", "sessions"),
    )
}

/// "Use 40%".
pub(crate) fn buffer_action(percent: u8) -> String {
    format!("Use {percent}%")
}

/// What an empty range says: nothing at all yet, or nothing in this range.
pub(crate) fn empty_line(no_data_yet: bool) -> &'static str {
    if no_data_yet {
        "Nothing recorded yet. Stats appear after your first focus session."
    } else {
        "Nothing recorded in this range yet."
    }
}

/// "<name>, 2 hours 10 minutes" or "<name>, nothing recorded".
fn amount(name: &str, minutes: u32) -> String {
    if minutes == 0 {
        format!("{name}, nothing recorded")
    } else {
        format!("{name}, {}", duration_spoken(minutes))
    }
}
