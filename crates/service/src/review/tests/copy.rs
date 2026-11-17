//! The copy test: it calls every `words::` function and checks the strings it returns, not
//! the source (as `routines/tests/words.rs` does).

use orasenda_core::HourCycle;
use orasenda_core::review::StatsRange;

use super::date;
use crate::review::words::*;

const RANGES: [StatsRange; 3] = [StatsRange::Week, StatsRange::Weeks8, StatsRange::Months6];
const BANNED: [&str; 6] = ["missed", "failed", "broken", "streak", "lost", "than last"];

/// Lines from every function, each with whether a '%' is allowed in it.
fn samples() -> Vec<(&'static str, String, bool)> {
    let mut lines: Vec<(&'static str, String, bool)> = Vec::new();
    let mut add =
        |name: &'static str, line: String, percent: bool| lines.push((name, line, percent));
    for minutes in [0, 1, 59, 60, 61, 130, 4000] {
        add("duration", duration(minutes), false);
        add("duration_spoken", duration_spoken(minutes), false);
        add("focus_line", focus_line(minutes, 3), false);
        add("task_spoken", task_spoken("Write", minutes), false);
        for goal in [0, 720] {
            if let Some(line) = goal_line(minutes, goal) {
                add("goal_line", line, false);
            }
            if let Some(line) = goal_words(minutes, goal) {
                add("goal_words", line, false);
            }
        }
    }
    for range in RANGES {
        let start = date(2026, 11, 16);
        add("bar_label", bar_label(range, start, false), false);
        add("bar_label", bar_label(range, start, true), false);
        add("bar_spoken", bar_spoken(range, start, 0), false);
        add("bar_spoken", bar_spoken(range, start, 95), false);
        for since in [None, Some(date(2026, 11, 3))] {
            for days in [0, 1, 9] {
                add("habit_line", habit_line(days, since, range), false);
            }
        }
    }
    for finished in [0, 1, 6] {
        add("routine_line", routine_line("Wind-down", finished), false);
    }
    for n in [0, 1, 4] {
        add("tasks_line", tasks_line(n), false);
        add("move_line", move_line(n), false);
    }
    add("day_label", day_label(date(2026, 11, 16)), false);
    add("week_label", week_label(date(2026, 11, 23)), false);
    add("month_label", month_label(date(2026, 10, 1)), false);
    for (tasks, planned, actual) in [(1, 1, 1), (6, 14, 17)] {
        add(
            "estimate_line",
            estimate_line(tasks, planned, actual).unwrap(),
            false,
        );
    }
    add("buffer_line", buffer_line(12, 28, 39, 40), true);
    add("buffer_action", buffer_action(40), true);
    for first in [true, false] {
        add("empty_line", empty_line(first).to_owned(), false);
    }
    for cycle in [HourCycle::H23, HourCycle::H12] {
        add("shutdown_line", shutdown_line(None, cycle), false);
        add("shutdown_line", shutdown_line(Some(1050), cycle), false);
        for planned in [0, 3] {
            let tomorrow = Tomorrow {
                day: date(2026, 11, 21),
                routines: vec![(Some(420), "Morning".to_owned())],
                due: vec!["File taxes".to_owned()],
                planned_sessions: planned,
                buffer: 40,
                priorities: vec!["Fix sync bug".to_owned()],
                cycle,
            };
            for line in tomorrow_lines(&tomorrow) {
                add("tomorrow_lines", line, true);
            }
        }
    }
    for weekly in [false, true] {
        add("completed_line", completed_line(weekly).to_owned(), false);
        add("week_line", week_line(weekly).to_owned(), false);
        add(
            "priority_line",
            priority_line("Fix sync bug", "Doing", weekly),
            false,
        );
    }
    add("nothing_unfinished", nothing_unfinished().to_owned(), false);
    add("undo_expired", undo_expired().to_owned(), false);
    add(
        "look_back_heading",
        look_back_heading(date(2026, 11, 16), date(2026, 11, 20)),
        false,
    );
    add("last_improvement", last_improvement("Start earlier"), false);
    add("period_line", period_line().to_owned(), false);
    add("nudge_shutdown", nudge_shutdown().to_owned(), false);
    add("nudge_weekly", nudge_weekly().to_owned(), false);
    add("load_failure", load_failure().to_owned(), false);
    add("save_failure", save_failure().to_owned(), false);
    lines
}

#[test]
fn words_have_no_banned_copy() {
    let lines = samples();
    assert!(lines.len() > 100, "the samples cover every function");
    for (name, line, percent) in lines {
        let lower = line.to_lowercase();
        assert!(!line.contains('!'), "{name}: {line}");
        assert!(
            !line
                .chars()
                .any(|c| matches!(c as u32, 0x1F300..=0x1FAFF | 0x2600..=0x27BF)),
            "{name}: {line}"
        );
        for word in BANNED {
            assert!(!lower.contains(word), "{name}: {line}");
        }
        if !percent {
            assert!(!line.contains('%'), "{name}: {line}");
        }
        if name == "habit_line" || name == "routine_line" {
            assert!(!has_of_digit(&lower), "{name}: {line}");
        }
        assert!(!line.is_empty() || name == "duration", "{name} is empty");
    }
}

/// "of 7", the denominator the copy never shows.
fn has_of_digit(lower: &str) -> bool {
    lower
        .match_indices("of ")
        .any(|(i, _)| lower[i + 3..].starts_with(|c: char| c.is_ascii_digit()))
}
