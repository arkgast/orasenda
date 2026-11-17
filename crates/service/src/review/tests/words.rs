//! Every sentence the spec quotes, as a table.

use orasenda_core::HourCycle;
use orasenda_core::review::StatsRange;

use super::date;
use crate::review::words::*;

#[test]
fn duration_words_table() {
    let table = [
        (0, "0m", "0 minutes"),
        (1, "1m", "1 minute"),
        (10, "10m", "10 minutes"),
        (60, "1h", "1 hour"),
        (120, "2h", "2 hours"),
        (61, "1h 1m", "1 hour 1 minute"),
        (130, "2h 10m", "2 hours 10 minutes"),
        (1230, "20h 30m", "20 hours 30 minutes"),
    ];
    for (minutes, shown, spoken) in table {
        assert_eq!(duration(minutes), shown);
        assert_eq!(duration_spoken(minutes), spoken);
    }
}

#[test]
fn focus_line_counts_sessions() {
    assert_eq!(focus_line(130, 5), "Focused for 2h 10m across 5 sessions.");
    assert_eq!(focus_line(25, 1), "Focused for 25m across 1 session.");
}

#[test]
fn habit_line_since_creation() {
    let since = Some(date(2026, 11, 3));
    assert_eq!(
        habit_line(9, since, StatsRange::Week),
        "Done on 9 days since 3 November."
    );
    assert_eq!(
        habit_line(1, since, StatsRange::Weeks8),
        "Done on 1 day since 3 November."
    );
    assert_eq!(
        habit_line(0, since, StatsRange::Week),
        "No check-ins since 3 November."
    );
}

#[test]
fn look_back_habit_line_names_that_week() {
    assert_eq!(look_back_habit_line(4, None), "Done on 4 days that week.");
    assert_eq!(look_back_habit_line(0, None), "No check-ins that week.");
    let since = Some(date(2026, 11, 3));
    assert_eq!(
        look_back_habit_line(1, since),
        "Done on 1 day since 3 November."
    );
}

#[test]
fn habit_line_no_denominator() {
    assert_eq!(
        habit_line(9, None, StatsRange::Week),
        "Done on 9 days this week."
    );
    assert_eq!(
        habit_line(14, None, StatsRange::Weeks8),
        "Done on 14 days in these 8 weeks."
    );
    assert_eq!(
        habit_line(30, None, StatsRange::Months6),
        "Done on 30 days in these 6 months."
    );
    assert_eq!(
        habit_line(0, None, StatsRange::Week),
        "No check-ins this week."
    );
}

#[test]
fn routine_line_finished_count() {
    assert_eq!(routine_line("Wind-down", 6), "Wind-down: finished 6 times.");
    assert_eq!(routine_line("Wind-down", 1), "Wind-down: finished once.");
    assert_eq!(routine_line("Wind-down", 0), "Wind-down: no finished runs.");
}

#[test]
fn goal_line_reached_and_not() {
    assert_eq!(
        goal_line(580, 720).as_deref(),
        Some("9h 40m of a 12h goal.")
    );
    assert_eq!(
        goal_line(720, 720).as_deref(),
        Some("You reached your 12h goal.")
    );
    assert_eq!(
        goal_line(900, 720).as_deref(),
        Some("You reached your 12h goal.")
    );
}

#[test]
fn goal_words_reached_form() {
    assert_eq!(goal_words(580, 720).as_deref(), Some("Goal 12h"));
    assert_eq!(goal_words(720, 720).as_deref(), Some("Goal 12h, reached"));
    assert_eq!(goal_words(721, 720).as_deref(), Some("Goal 12h, reached"));
}

#[test]
fn no_goal_gives_none() {
    assert_eq!(goal_line(300, 0), None);
    assert_eq!(goal_words(300, 0), None);
}

#[test]
fn bar_words_by_range() {
    let tuesday = date(2026, 11, 17);
    assert_eq!(bar_label(StatsRange::Week, tuesday, false), "Tue");
    assert_eq!(
        bar_label(StatsRange::Weeks8, date(2026, 11, 16), false),
        "16 Nov"
    );
    assert_eq!(
        bar_label(StatsRange::Months6, date(2026, 10, 1), false),
        "Oct"
    );
    assert_eq!(bar_label(StatsRange::Week, tuesday, true), "Today");
    assert_eq!(bar_label(StatsRange::Weeks8, tuesday, true), "This week");
    assert_eq!(bar_label(StatsRange::Months6, tuesday, true), "This month");
    assert_eq!(
        bar_spoken(StatsRange::Week, tuesday, 130),
        "Tuesday 17 November, 2 hours 10 minutes"
    );
    assert_eq!(
        bar_spoken(StatsRange::Week, date(2026, 11, 21), 0),
        "Saturday 21 November, nothing recorded"
    );
    assert_eq!(
        bar_spoken(StatsRange::Weeks8, date(2026, 11, 16), 300),
        "Week of 16 November, 5 hours"
    );
    assert_eq!(
        bar_spoken(StatsRange::Months6, date(2026, 10, 1), 60),
        "October, 1 hour"
    );
    assert_eq!(
        task_spoken("Fix sync bug", 130),
        "Fix sync bug, 2 hours 10 minutes"
    );
}

#[test]
fn labels_read_in_english() {
    assert_eq!(day_label(date(2026, 11, 16)), "Monday 16 November");
    assert_eq!(
        week_label(date(2026, 11, 23)),
        "Planning the week of 23 November"
    );
    assert_eq!(month_label(date(2026, 10, 1)), "October");
    assert_eq!(
        look_back_heading(date(2026, 11, 16), date(2026, 11, 20)),
        "Monday 16 to Friday 20 November"
    );
    assert_eq!(
        look_back_heading(date(2026, 11, 30), date(2026, 12, 4)),
        "Monday 30 November to Friday 4 December"
    );
}

#[test]
fn estimate_line_g1_wording() {
    assert_eq!(
        estimate_line(6, 14, 17).as_deref(),
        Some(
            "6 finished tasks had an estimate: 14 sessions planned, 17 sessions of 5 minutes or more."
        )
    );
    assert_eq!(
        estimate_line(1, 1, 1).as_deref(),
        Some("1 finished task had an estimate: 1 session planned, 1 session of 5 minutes or more.")
    );
}

#[test]
fn estimate_line_none_without_tasks() {
    assert_eq!(estimate_line(0, 0, 0), None);
}

#[test]
fn buffer_line_and_action() {
    assert_eq!(buffer_action(40), "Use 40%");
    assert_eq!(
        buffer_line(12, 28, 39, 40),
        "12 finished tasks: 28 sessions planned, 39 sessions of 5 minutes or more. A 40% buffer would fit these."
    );
}

#[test]
fn empty_range_line() {
    assert_eq!(
        empty_line(true),
        "Nothing recorded yet. Stats appear after your first focus session."
    );
    assert_eq!(empty_line(false), "Nothing recorded in this range yet.");
    assert_eq!(tasks_line(4), "Finished 4 tasks.");
    assert_eq!(tasks_line(1), "Finished 1 task.");
    assert_eq!(tasks_line(0), "No tasks finished.");
}

#[test]
fn move_line_singular_plural() {
    assert_eq!(move_line(2), "Moved 2 tasks to Backlog.");
    assert_eq!(move_line(1), "Moved 1 task to Backlog.");
    assert_eq!(nothing_unfinished(), "Nothing unfinished.");
    assert_eq!(put_back_line(1), "Put 1 task back.");
    assert_eq!(put_back_line(3), "Put 3 tasks back.");
    assert_eq!(undo_expired(), "That can't be undone now.");
}

#[test]
fn tomorrow_empty_day() {
    let tomorrow = Tomorrow {
        day: date(2026, 11, 21),
        routines: vec![],
        due: vec![],
        planned_sessions: 0,
        buffer: 40,
        priorities: vec![],
        cycle: HourCycle::H23,
    };
    assert_eq!(
        tomorrow_lines(&tomorrow),
        [
            "Saturday 21 November.",
            "No routines scheduled.",
            "Nothing due."
        ]
    );
}

#[test]
fn tomorrow_planned_mirrors_board() {
    let tomorrow = Tomorrow {
        day: date(2026, 11, 17),
        routines: vec![(Some(7 * 60), "Morning".to_owned())],
        due: vec!["File taxes".to_owned()],
        planned_sessions: 5,
        buffer: 40,
        priorities: vec!["Fix sync bug".to_owned()],
        cycle: HourCycle::H12,
    };
    assert_eq!(
        tomorrow_lines(&tomorrow),
        [
            "Tuesday 17 November.",
            "Routines: Morning at 7:00 AM.",
            "Due: File taxes.",
            "Planned 5 sessions with a 40% buffer",
            "Priorities this week: Fix sync bug."
        ]
    );
    let one = Tomorrow {
        planned_sessions: 1,
        buffer: 25,
        ..tomorrow
    };
    assert!(tomorrow_lines(&one).contains(&"Planned 1 session with a 25% buffer".to_owned()));
}

#[test]
fn status_lines() {
    assert_eq!(shutdown_line(None, HourCycle::H23), "Ready when you are.");
    assert_eq!(
        shutdown_line(Some(17 * 60 + 42), HourCycle::H23),
        "Shutdown complete at 17:42."
    );
    assert_eq!(
        shutdown_line(Some(17 * 60 + 42), HourCycle::H12),
        "Shutdown complete at 5:42 PM."
    );
    assert_eq!(completed_line(false), "Shutdown complete.");
    assert_eq!(completed_line(true), "Week planned.");
    assert_eq!(week_line(false), "Ready when you are.");
    assert_eq!(week_line(true), "Week planned.");
    assert_eq!(
        priority_line("Fix sync bug", "Doing", false),
        "Fix sync bug · Doing"
    );
    assert_eq!(
        priority_line("Fix sync bug", "Doing", true),
        "Fix sync bug · Done"
    );
    assert_eq!(
        last_improvement("Start earlier"),
        "Last week you chose: Start earlier"
    );
}

#[test]
fn nudge_texts() {
    assert_eq!(nudge_shutdown(), "Ready to close the day when you are.");
    assert_eq!(nudge_weekly(), "Your weekly review is ready when you are.");
}

#[test]
fn period_line_plain() {
    assert_eq!(
        period_line(),
        "This review is for an earlier day. Open Review again to see today."
    );
    assert_eq!(load_failure(), "Orasenda can't load your review right now.");
    assert_eq!(
        save_failure(),
        "Orasenda can't save your reflection right now."
    );
}
