//! The stats view through the recording host: ranges, the goal, dots, habits, routines, the
//! estimate line, the empty lines and the failures.

use orasenda_core::LocalDate;

use super::support::*;
use crate::api::{HabitDraft, ReviewError, RoutineDraft, StatsRange, StatsView};
use crate::review::{run_review_stats, stats_parts};
use crate::routines::{
    run_habit_check, run_habit_create, run_habit_remove, run_routine_create, run_routine_remove,
};
use crate::session::lock;
use crate::session::test_support::{TestHost, db};

fn stats(host: &TestHost, range: StatsRange) -> StatsView {
    run_review_stats(host, range).expect("stats read")
}

fn goal_12h(host: &TestHost) {
    settings(host, |s| s.review_focus_goal_hours = 12);
}

fn habit(name: &str) -> HabitDraft {
    HabitDraft {
        name: name.into(),
        when_text: None,
        where_text: None,
        anchor: None,
        two_minute: None,
        identity: None,
        optional: false,
        days: None,
    }
}

#[test]
fn stats_week_goal_row() {
    let host = host();
    goal_12h(&host);
    // Monday 2 November, 2h 10m; today is Saturday 7 November.
    session(&host, "s1", 5, 130, None);
    let view = stats(&host, StatsRange::Week);
    let goal = view.goal.expect("a goal on Week");
    assert_eq!(goal.minutes, 720);
    assert_eq!(goal.words, "Goal 12h");
    assert_eq!(goal.line, "2h 10m of a 12h goal.");
    assert_eq!(view.bars.len(), 7);
    assert_eq!(view.bars[0].label, "Mon");
    assert_eq!(view.bars[0].spoken, "Monday 2 November, 2 hours 10 minutes");
    assert_eq!(view.bars[0].duration, "2h 10m");
    assert!(!view.bars[0].empty);
    assert_eq!(view.bars[5].label, "Today");
    assert!(view.bars[5].current && view.bars[5].empty);
    assert!(view.bars[6].empty, "Sunday has not come");
    assert_eq!(
        view.summary,
        ["Focused for 2h 10m across 1 session.", "No tasks finished."]
    );
}

#[test]
fn stats_week_goal_reached_is_said_plainly() {
    let host = host();
    goal_12h(&host);
    for (n, id) in ["a", "b", "c", "d"].iter().enumerate() {
        session(&host, id, n as u64 + 1, 180, None);
    }
    let goal = stats(&host, StatsRange::Week).goal.expect("a goal");
    assert_eq!(goal.line, "You reached your 12h goal.");
    assert_eq!(goal.words, "Goal 12h, reached");
}

#[test]
fn stats_weeks8_goal_ticks() {
    let host = host();
    goal_12h(&host);
    session(&host, "s1", 12, 60, None);
    let view = stats(&host, StatsRange::Weeks8);
    assert_eq!(view.bars.len(), 8);
    assert_eq!(view.bars[7].label, "This week");
    let goal = view.goal.expect("a tick per week");
    assert_eq!((goal.minutes, goal.words.as_str()), (720, "Goal 12h"));
}

#[test]
fn stats_months6_no_goal() {
    let host = host();
    goal_12h(&host);
    session(&host, "s1", 40, 60, None);
    let view = stats(&host, StatsRange::Months6);
    assert_eq!(view.bars.len(), 6);
    assert_eq!(view.bars[5].label, "This month");
    assert_eq!(view.goal, None);
}

#[test]
fn stats_no_goal_is_none_everywhere() {
    let host = host();
    session(&host, "s1", 1, 60, None);
    for range in [StatsRange::Week, StatsRange::Weeks8, StatsRange::Months6] {
        assert_eq!(stats(&host, range).goal, None);
    }
}

#[test]
fn stats_dots_week_only() {
    let host = host();
    session(&host, "s1", 1, 60, None);
    run_habit_create(&host, None, &habit("Walk")).unwrap();
    let week = stats(&host, StatsRange::Week);
    assert_eq!(week.habits.len(), 1);
    assert!(week.habits[0].dots.as_ref().is_some_and(|d| !d.is_empty()));
    for range in [StatsRange::Weeks8, StatsRange::Months6] {
        assert_eq!(stats(&host, range).habits[0].dots, None);
    }
}

#[test]
fn stats_mid_range_habit_says_since() {
    let host = host();
    let id = run_habit_create(&host, None, &habit("Walk")).unwrap();
    run_habit_check(&host, &id, true).unwrap();
    let view = stats(&host, StatsRange::Week);
    assert_eq!(view.habits[0].name, "Walk");
    assert_eq!(view.habits[0].line, "Done on 1 day since 7 November.");
}

#[test]
fn stats_skip_removed_habits_and_routines() {
    let host = host();
    let routine = RoutineDraft {
        name: "Wind-down".into(),
        time_of_day: None,
        days: 127,
    };
    let routine_id = run_routine_create(&host, &routine).unwrap();
    run_habit_create(&host, Some(&routine_id), &habit("Stretch")).unwrap();
    let walk = run_habit_create(&host, None, &habit("Walk")).unwrap();
    let view = stats(&host, StatsRange::Week);
    assert_eq!(view.routines, ["Wind-down: no finished runs."]);
    assert_eq!(view.habits.len(), 2);
    run_routine_remove(&host, &routine_id).unwrap();
    run_habit_remove(&host, &walk).unwrap();
    let view = stats(&host, StatsRange::Week);
    assert!(view.routines.is_empty(), "{:?}", view.routines);
    assert!(view.habits.is_empty(), "{:?}", view.habits);
}

#[test]
fn stats_routine_lines_count_finished_runs_only() {
    let host = host();
    let routine = RoutineDraft {
        name: "Wind-down".into(),
        time_of_day: None,
        days: 127,
    };
    let id = run_routine_create(&host, &routine).unwrap();
    finished_runs(&host, &id, 2);
    let view = stats(&host, StatsRange::Week);
    assert_eq!(view.routines, ["Wind-down: finished 2 times."]);
}

#[test]
fn stats_estimate_line_follows_g1() {
    let host = host();
    done_task(&host, "t1", 1, Some(3), 4);
    done_task(&host, "t2", 2, Some(2), 2);
    done_task(&host, "t3", 2, None, 1);
    done_task(&host, "t4", 3, Some(2), 0);
    session(&host, "short", 3, 3, Some("t4"));
    let view = stats(&host, StatsRange::Week);
    assert_eq!(
        view.estimate_line.as_deref(),
        Some("2 finished tasks had an estimate: 5 sessions planned, 6 sessions of 5 minutes or more.")
    );
    assert_eq!(view.summary[1], "Finished 4 tasks.");
    // A task done before this week is in the longer range only.
    done_task(&host, "old", 20, Some(1), 1);
    assert!(
        stats(&host, StatsRange::Week)
            .estimate_line
            .is_some_and(|line| line.starts_with("2 finished"))
    );
    assert!(
        stats(&host, StatsRange::Weeks8)
            .estimate_line
            .is_some_and(|line| line.starts_with("3 finished"))
    );
}

#[test]
fn stats_estimate_line_is_none_when_no_task_qualifies() {
    let host = host();
    done_task(&host, "t1", 1, None, 2);
    assert_eq!(stats(&host, StatsRange::Week).estimate_line, None);
}

#[test]
fn stats_empty_range_line() {
    let host = host();
    // Focused long ago: something was recorded, just not in this week.
    session(&host, "old", 40, 30, None);
    let view = stats(&host, StatsRange::Week);
    let line = "Nothing recorded in this range yet.";
    assert_eq!(view.empty.as_deref(), Some(line));
    assert_eq!(view.summary, [line]);
    assert!(view.bars.iter().all(|bar| bar.empty && bar.duration.is_empty()));
    assert_eq!(view.bars.len(), 7, "the labels stay");
}

#[test]
fn stats_nothing_ever_line() {
    let host = host();
    let view = stats(&host, StatsRange::Week);
    let line = "Nothing recorded yet. Stats appear after your first focus session.";
    assert_eq!(view.empty.as_deref(), Some(line));
    assert_eq!(view.summary, [line]);
}

#[test]
fn stats_a_range_with_focus_has_no_empty_line() {
    let host = host();
    session(&host, "s1", 1, 30, None);
    assert_eq!(stats(&host, StatsRange::Week).empty, None);
}

#[test]
fn stats_store_unavailable() {
    let host = host();
    db(&lock(&host.0.service)).fail_reads(true);
    assert_eq!(
        run_review_stats(&host, StatsRange::Week),
        Err(ReviewError::Store)
    );
}

#[test]
fn stats_parts_reads_any_date_range() {
    let host = host();
    session(&host, "last-week", 8, 40, None);
    session(&host, "today", 0, 20, None);
    let date = |d| LocalDate::new(2026, 10, d).unwrap();
    let service = lock(&host.0.service);
    let parts = db(&service)
        .read(|txn| stats_parts(txn, date(26), date(31), 60))
        .expect("reads");
    assert_eq!(parts.sessions.len(), 1);
    assert_eq!(parts.sessions[0].date, date(30));
    assert_eq!(parts.sessions[0].focused_ms, 40 * 60_000);
}
