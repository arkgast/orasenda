use super::d;
use crate::review::{Suggestion, suggest};
use crate::routines::LocalDate;

fn today() -> LocalDate {
    d(2026, 11, 16)
}

/// `counted` per task, each estimated at 4 sessions, done every 5 days back from today.
fn tasks(counted: &[u32]) -> Vec<(LocalDate, u8, u32)> {
    let mut day = today();
    let mut list = Vec::new();
    for &count in counted {
        list.push((day, 4, count));
        for _ in 0..5 {
            day = day.pred();
        }
    }
    list
}

/// Ten tasks (40 estimated sessions) with `actual` counted sessions in all.
fn ten(actual: u32) -> Vec<(LocalDate, u8, u32)> {
    let mut counted = vec![actual / 10; 10];
    counted[0] += actual % 10;
    tasks(&counted)
}

fn percent(actual: u32) -> u8 {
    suggest(&ten(actual), today()).expect("a suggestion").percent
}

#[test]
fn suggest_nine_tasks_none() {
    assert_eq!(suggest(&tasks(&[5; 9]), today()), None);
}

#[test]
fn suggest_two_weeks_none() {
    let list: Vec<_> = (0..12).map(|i| (d(2026, 11, 9 + i % 8), 4, 5)).collect();
    assert_eq!(suggest(&list, today()), None, "twelve tasks in two Monday-weeks");
}

#[test]
fn suggest_skips_a_task_with_no_counted_session() {
    let mut counted = vec![5; 12];
    counted[3] = 0;
    counted[7] = 0;
    let got = suggest(&tasks(&counted), today()).expect("ten tasks count");
    assert_eq!((got.tasks, got.estimated, got.actual), (10, 40, 50));
    counted[8] = 0;
    assert_eq!(suggest(&tasks(&counted), today()), None, "nine tasks count");
}

#[test]
fn suggest_skips_four_minute_session() {
    // The caller counts only sessions of 5 focused minutes or more, so a task whose only
    // session lasted 4 minutes arrives with 0 and is not eligible.
    let mut list = tasks(&[5; 10]);
    list[9].2 = 0;
    assert_eq!(suggest(&list, today()), None);
}

#[test]
fn suggest_window_is_the_last_56_days() {
    let mut list = tasks(&[5; 10]);
    let mut oldest = today();
    for _ in 0..55 {
        oldest = oldest.pred();
    }
    list[9].0 = oldest;
    assert!(suggest(&list, today()).is_some(), "55 days back is inside");
    list[9].0 = oldest.pred();
    assert_eq!(suggest(&list, today()), None, "56 days back is outside");
    list[9].0 = today().succ();
    assert_eq!(suggest(&list, today()), None, "a day after today is ignored");
}

#[test]
fn suggest_rounds_to_five() {
    assert_eq!(percent(52), 30, "exactly 30");
    assert_eq!(percent(54), 35, "35 exactly");
    assert_eq!(percent(53), 35, "32.5 is a tie and rounds up");
    assert_eq!(percent(51), 30, "27.5 is a tie and rounds up");
}

#[test]
fn suggest_clamps_25_and_50() {
    assert_eq!(percent(41), 25, "2.5 percent over");
    assert_eq!(percent(200), 50, "far over");
    assert_eq!(percent(60), 50, "exactly 50");
}

#[test]
fn suggest_ratio_below_one_is_25() {
    assert_eq!(percent(30), 25);
}

#[test]
fn suggest_reports_its_numbers() {
    let got = suggest(&ten(52), today()).expect("a suggestion");
    assert_eq!(
        got,
        Suggestion { percent: 30, tasks: 10, estimated: 40, actual: 52 }
    );
}
