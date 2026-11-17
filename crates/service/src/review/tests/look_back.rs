//! The weekly view: the look-back's range, top tasks, G1 estimate line, reflections and the
//! previous week's improvement.

use orasenda_store::reflections::{self, ReflectionKind, ReflectionWrite};

use super::support::*;
use crate::api::{ReviewError, WeeklyView};
use crate::review::run_weekly_get;
use crate::session::lock;
use crate::session::test_support::{T0, TestHost, db};

fn weekly(host: &TestHost) -> WeeklyView {
    run_weekly_get(host).expect("the weekly view")
}

fn write(host: &TestHost, write: ReflectionWrite) {
    lock(&host.0.service)
        .store()
        .expect("a store")
        .write(T0, |txn| reflections::upsert(txn, &write))
        .expect("reflection saved");
}

fn shutdown(period: &str, answers: [Option<&str>; 3]) -> ReflectionWrite {
    ReflectionWrite {
        kind: ReflectionKind::Shutdown,
        period: period.into(),
        went_well: answers[0].map(str::to_owned),
        to_improve: answers[1].map(str::to_owned),
        outside_control: answers[2].map(str::to_owned),
        improvement: None,
        notes: None,
        priorities: Vec::new(),
        complete: true,
    }
}

fn week(period: &str, improvement: Option<&str>, complete: bool) -> ReflectionWrite {
    ReflectionWrite {
        kind: ReflectionKind::Week,
        period: period.into(),
        went_well: None,
        to_improve: None,
        outside_control: None,
        improvement: improvement.map(str::to_owned),
        notes: Some("Slow start".into()),
        priorities: Vec::new(),
        complete,
    }
}

#[test]
fn look_back_range_follows_planned_week() {
    let host = host();
    // Saturday 7 November plans Monday 9, so it looks back on Monday 2 to Sunday 8.
    session(&host, "before", 7, 25, None);
    session(&host, "monday", 5, 30, None);
    session(&host, "friday", 1, 45, None);
    let view = weekly(&host);
    assert_eq!(view.week_start, "2026-11-09");
    assert_eq!(view.label, "Planning the week of 9 November");
    assert_eq!(view.look_back.heading, "Monday 2 to Sunday 8 November");
    assert_eq!(view.look_back.focus_line, "Focused for 1h 15m across 2 sessions.");
    assert_eq!(view.look_back.days.len(), 7);
    assert_eq!(view.look_back.days[0].minutes, 30);
    assert_eq!(view.look_back.days[0].label, "Mon");
    assert_eq!(view.look_back.days[4].minutes, 45);
    assert!(view.look_back.days[1].empty);
    assert_eq!(view.look_back.tasks_line, "No tasks finished.");

    // Thursday 5 November plans Monday 2, so it looks back on 26 October to 1 November.
    host.set_now(T0 - 2 * DAY);
    let view = weekly(&host);
    assert_eq!(view.week_start, "2026-11-02");
    assert_eq!(view.look_back.heading, "Monday 26 October to Sunday 1 November");
    assert_eq!(view.look_back.focus_line, "Focused for 25m across 1 session.");
}

#[test]
fn goal_follows_the_look_back_total() {
    let host = host();
    settings(&host, |s| s.review_focus_goal_hours = 12);
    session(&host, "monday", 5, 130, None);
    let goal = weekly(&host).look_back.goal.expect("a goal");
    assert_eq!(goal.words, "Goal 12h");
    assert_eq!(goal.line, "2h 10m of a 12h goal.");
    settings(&host, |s| s.review_focus_goal_hours = 0);
    assert_eq!(weekly(&host).look_back.goal, None);
}

#[test]
fn top_five_tasks_by_focus() {
    let host = host();
    // Seven tasks with 1 to 7 sessions of 25 minutes each.
    for n in 1..=7u32 {
        done_task(&host, &format!("task{n}"), 5, None, n);
    }
    let tasks = weekly(&host).look_back.tasks;
    let titles: Vec<&str> = tasks.iter().map(|bar| bar.label.as_str()).collect();
    assert_eq!(titles, ["task7", "task6", "task5", "task4", "task3"]);
    assert_eq!(tasks[0].minutes, 175);
    assert_eq!(tasks[0].duration, "2h 55m");
    assert_eq!(tasks[0].spoken, "task7, 2 hours 55 minutes");
    assert!(!tasks[0].empty);
}

#[test]
fn look_back_estimate_line_g1() {
    let host = host();
    done_task(&host, "a", 5, Some(2), 3);
    done_task(&host, "b", 4, Some(2), 2);
    // Not counted: no estimate, no session, finished before the look-back.
    done_task(&host, "c", 3, None, 2);
    done_task(&host, "d", 3, Some(2), 0);
    done_task(&host, "e", 10, Some(2), 2);
    let view = weekly(&host);
    assert_eq!(
        view.look_back.estimate_line.as_deref(),
        Some("2 finished tasks had an estimate: 4 sessions planned, 5 sessions of 5 minutes or more.")
    );
    assert_eq!(view.look_back.tasks_line, "Finished 4 tasks.");
    let host = self::host();
    assert_eq!(weekly(&host).look_back.estimate_line, None);
}

#[test]
fn reflections_echoed_not_counted() {
    let host = host();
    write(&host, shutdown("2026-11-04", [Some("Wrote the draft"), None, Some("The rain")]));
    write(&host, shutdown("2026-11-03", [None, Some("Start earlier"), None]));
    // Blank answers, and days outside the look-back, are left out.
    write(&host, shutdown("2026-11-05", [Some("  "), None, None]));
    write(&host, shutdown("2026-11-09", [Some("Too late"), None, None]));
    let echoes = weekly(&host).look_back.reflections;
    assert_eq!(echoes.len(), 2);
    assert_eq!(echoes[0].day_label, "Tuesday 3 November");
    assert_eq!(echoes[0].lines, ["Start earlier"]);
    assert_eq!(echoes[1].day_label, "Wednesday 4 November");
    assert_eq!(echoes[1].lines, ["Wrote the draft", "The rain"]);
}

#[test]
fn no_reflections_omitted() {
    let host = host();
    assert!(weekly(&host).look_back.reflections.is_empty());
}

#[test]
fn last_improvement_shown() {
    let host = host();
    assert_eq!(weekly(&host).last_improvement, None);
    write(&host, week("2026-11-02", Some("Take real breaks"), true));
    let view = weekly(&host);
    assert_eq!(
        view.last_improvement.as_deref(),
        Some("Last week you chose: Take real breaks")
    );
    assert_eq!(view.completed_line, None);
    assert_eq!(view.answers.improvement, None);
}

#[test]
fn answers_and_completed_line_follow_the_planned_week() {
    let host = host();
    write(&host, week("2026-11-09", Some("Fewer tabs"), false));
    let view = weekly(&host);
    assert_eq!(view.answers.improvement.as_deref(), Some("Fewer tabs"));
    assert_eq!(view.answers.notes.as_deref(), Some("Slow start"));
    assert_eq!(view.completed_line, None);
    write(&host, week("2026-11-09", Some("Fewer tabs"), true));
    assert_eq!(weekly(&host).completed_line.as_deref(), Some("Week planned."));
}

#[test]
fn weekly_store_unavailable() {
    let host = host();
    db(&lock(&host.0.service)).fail_reads(true);
    assert_eq!(run_weekly_get(&host), Err(ReviewError::Store));
}
