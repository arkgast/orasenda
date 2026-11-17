//! The routines types' wire shapes match the spec's Interfaces (camelCase).

use serde_json::json;

use crate::api::{
    HabitDayState, HabitDotView, RoutineToday, RoutinesError, RunStepView, RunView, StepState,
    TemplateId,
};

#[test]
fn enums_are_camel_case() {
    let text = |value: serde_json::Value| value.as_str().unwrap().to_owned();
    assert_eq!(text(json!(RoutineToday::NotStarted)), "notStarted");
    assert_eq!(text(json!(RoutineToday::InProgress)), "inProgress");
    assert_eq!(text(json!(HabitDayState::NotDone)), "notDone");
    assert_eq!(text(json!(StepState::Skipped)), "skipped");
    assert_eq!(text(json!(RoutinesError::NotFound)), "notFound");
    assert_eq!(text(json!(RoutinesError::TooLong)), "tooLong");
    assert_eq!(text(json!(TemplateId::DeepWorkStart)), "deepWorkStart");
}

#[test]
fn views_are_camel_case() {
    let dot = HabitDotView {
        state: HabitDayState::Upcoming,
        today: true,
        label: "Monday 9 November".into(),
        weekday: 0,
    };
    assert_eq!(
        json!(dot),
        json!({ "state": "upcoming", "today": true, "label": "Monday 9 November", "weekday": 0 })
    );
    let run = RunView {
        id: "run".into(),
        routine_id: "r".into(),
        routine_name: "Morning".into(),
        steps: vec![RunStepView {
            habit_id: "h".into(),
            name: "Water".into(),
            detail: vec![],
            optional: false,
            state: StepState::Upcoming,
        }],
        current: Some(0),
        done: 0,
        skipped: 0,
        total: 1,
        wellness: false,
        line: "Step 1 of 1".into(),
    };
    let value = json!(run);
    assert_eq!(value["routineId"], "r");
    assert_eq!(value["routineName"], "Morning");
    assert_eq!(value["steps"][0]["habitId"], "h");
}

#[test]
fn a_draft_reads_camel_case() {
    let draft: crate::api::HabitDraft = serde_json::from_value(json!({
        "name": "Walk", "whenText": null, "whereText": "Park", "anchor": null,
        "twoMinute": "shoes on", "identity": null, "optional": false, "days": 31
    }))
    .unwrap();
    assert_eq!(draft.where_text.as_deref(), Some("Park"));
    assert_eq!(draft.two_minute.as_deref(), Some("shoes on"));
    let routine: crate::api::RoutineDraft =
        serde_json::from_value(json!({ "name": "R", "timeOfDay": 420, "days": 127 })).unwrap();
    assert_eq!(routine.time_of_day, Some(420));
}
