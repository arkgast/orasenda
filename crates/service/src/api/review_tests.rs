//! The review API types' wire shapes (spec 2026-11-16, §Service and IPC).

use serde_json::json;

use super::*;

pub(crate) fn bar() -> BarView {
    BarView {
        label: "Tue".into(),
        spoken: "Tuesday 17 November, 2 hours 10 minutes".into(),
        minutes: 130,
        duration: "2h 10m".into(),
        current: false,
        empty: false,
    }
}

pub(crate) fn priority() -> PriorityView {
    PriorityView {
        task_id: "t1".into(),
        title: "Fix sync bug".into(),
        done: false,
        line: "Fix sync bug · Doing".into(),
    }
}

pub(crate) fn review() -> ReviewView {
    ReviewView {
        today: ShutdownStatus {
            day: "2026-11-16".into(),
            day_label: "Monday 16 November".into(),
            done: false,
            line: "Ready when you are.".into(),
        },
        week: WeekStatus {
            week_start: "2026-11-23".into(),
            label: "Planning the week of 23 November".into(),
            planned: false,
            line: "No priorities yet.".into(),
            priorities: vec![priority()],
        },
        primary: ReviewPrimary::Weekly,
    }
}

#[test]
fn review_types_serialise_camel_case() {
    let value = serde_json::to_value(review()).unwrap();
    assert_eq!(value["today"]["dayLabel"], "Monday 16 November");
    assert_eq!(value["week"]["weekStart"], "2026-11-23");
    assert_eq!(value["week"]["priorities"][0]["taskId"], "t1");
    assert_eq!(value["primary"], "weekly");
    assert_eq!(
        serde_json::to_value(ReviewPrimary::Shutdown).unwrap(),
        "shutdown"
    );
    assert_eq!(serde_json::to_value(ReviewPrimary::None).unwrap(), "none");

    let shutdown = ShutdownView {
        day: "2026-11-16".into(),
        day_label: "Monday 16 November".into(),
        unfinished: vec![UnfinishedTask {
            id: "t2".into(),
            title: "Write notes".into(),
            lane_label: "Doing".into(),
            active: true,
        }],
        tomorrow: vec!["Fix sync bug".into()],
        answers: ShutdownAnswers {
            went_well: Some("A quiet morning".into()),
            to_improve: None,
            outside_control: None,
        },
        completed_line: None,
    };
    let value = serde_json::to_value(&shutdown).unwrap();
    assert_eq!(value["unfinished"][0]["laneLabel"], "Doing");
    assert_eq!(value["answers"]["wentWell"], "A quiet morning");
    assert_eq!(value["answers"]["toImprove"], json!(null));
    assert_eq!(value["completedLine"], json!(null));

    let weekly = WeeklyView {
        week_start: "2026-11-23".into(),
        label: "Planning the week of 23 November".into(),
        look_back: LookBack {
            heading: "Monday 16 to Friday 20 November".into(),
            focus_line: "12h 5m of focus".into(),
            days: vec![bar()],
            goal: Some(GoalView {
                minutes: 720,
                words: "Goal 12h".into(),
                line: "You reached your 12h goal.".into(),
            }),
            tasks: vec![bar()],
            tasks_line: "5 tasks done".into(),
            routine_lines: vec![],
            habit_lines: vec![],
            estimate_line: None,
            reflections: vec![ReflectionEcho {
                day_label: "Monday 16 November".into(),
                lines: vec!["A quiet morning".into()],
            }],
        },
        answers: WeeklyAnswers {
            improvement: None,
            notes: None,
            priorities: vec![priority()],
        },
        last_improvement: None,
        completed_line: None,
    };
    let value = serde_json::to_value(&weekly).unwrap();
    assert_eq!(value["lookBack"]["focusLine"], "12h 5m of focus");
    assert_eq!(value["lookBack"]["days"][0]["spoken"], bar().spoken);
    assert_eq!(
        value["lookBack"]["reflections"][0]["dayLabel"],
        "Monday 16 November"
    );
    assert_eq!(value["lookBack"]["goal"]["words"], "Goal 12h");
    assert_eq!(value["lastImprovement"], json!(null));

    let stats = StatsView {
        range: StatsRange::Weeks8,
        summary: vec![],
        bars: vec![bar()],
        goal: None,
        routines: vec![],
        habits: vec![HabitStat {
            name: "Water".into(),
            line: "Done on 9 days this week".into(),
            dots: None,
        }],
        estimate_line: None,
        buffer: Some(BufferSuggestionView {
            percent: 40,
            line: "A 40% buffer would fit.".into(),
            action: "Use 40%".into(),
        }),
        empty: None,
    };
    let value = serde_json::to_value(&stats).unwrap();
    assert_eq!(value["range"], "weeks8");
    assert_eq!(value["habits"][0]["dots"], json!(null));
    assert_eq!(value["buffer"]["action"], "Use 40%");
    assert_eq!(value["estimateLine"], json!(null));
    assert_eq!(serde_json::to_value(StatsRange::Week).unwrap(), "week");
    assert_eq!(
        serde_json::to_value(StatsRange::Months6).unwrap(),
        "months6"
    );

    let undo = MoveUndo {
        token: "tok".into(),
        line: "Moved 2 tasks to Backlog.".into(),
    };
    assert_eq!(
        serde_json::to_value(undo).unwrap(),
        json!({ "token": "tok", "line": "Moved 2 tasks to Backlog." })
    );
}

#[test]
fn priority_pick_union_shape() {
    let draft = WeeklyDraft {
        improvement: Some("Start earlier".into()),
        notes: None,
        priorities: vec![
            PriorityPick::Task("t1".into()),
            PriorityPick::NewTitle("Plan the move".into()),
        ],
    };
    let value = serde_json::to_value(&draft).unwrap();
    assert_eq!(
        value["priorities"],
        json!([{ "task": "t1" }, { "newTitle": "Plan the move" }])
    );
    let back: WeeklyDraft = serde_json::from_value(value).unwrap();
    assert_eq!(back, draft);
    let bare: WeeklyDraft = serde_json::from_value(json!({ "priorities": [] })).unwrap();
    assert_eq!(bare.improvement, None);
    assert!(bare.priorities.is_empty());
}

#[test]
fn review_error_kinds_serialise() {
    for (error, name) in [
        (ReviewError::NotFound, "notFound"),
        (ReviewError::TooLong, "tooLong"),
        (ReviewError::Full, "full"),
        (ReviewError::Empty, "empty"),
        (ReviewError::Period, "period"),
        (ReviewError::Store, "store"),
    ] {
        assert_eq!(serde_json::to_value(error).unwrap(), name);
    }
}
