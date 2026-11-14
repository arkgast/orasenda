//! Rust words every sentence and time (ADR-011).

use orasenda_core::HourCycle;
use orasenda_core::routines::templates;

use super::super::words::*;
use crate::api::RoutineToday;

#[test]
fn time_follows_the_hour_cycle() {
    assert_eq!(time_label(7 * 60, HourCycle::H23), "07:00");
    assert_eq!(time_label(7 * 60, HourCycle::H12), "7:00 AM");
    assert_eq!(time_label(17 * 60 + 30, HourCycle::H12), "5:30 PM");
    assert_eq!(time_label(0, HourCycle::H12), "12:00 AM");
    assert_eq!(time_label(1439, HourCycle::H23), "23:59");
}

#[test]
fn days_label_words_the_mask() {
    assert_eq!(days_label(127).as_deref(), Some("Every day"));
    assert_eq!(days_label(31).as_deref(), Some("Weekdays"));
    assert_eq!(days_label(96).as_deref(), Some("Weekends"));
    assert_eq!(days_label(1 | 4 | 16).as_deref(), Some("Mon, Wed, Fri"));
    assert_eq!(days_label(0), None);
    assert_eq!(days_label(128), None);
}

#[test]
fn intention_reads_as_one_sentence() {
    assert_eq!(
        intention("Drink a glass of water", Some("7:00"), Some("the kitchen")),
        "I will drink a glass of water at 7:00 in the kitchen."
    );
    assert_eq!(
        intention(
            "Drink a glass of water",
            Some("at 7:00"),
            Some("in the kitchen")
        ),
        "I will drink a glass of water at 7:00 in the kitchen."
    );
    assert_eq!(
        intention("Stretch", Some("After breakfast"), Some("at my desk.")),
        "I will stretch after breakfast at my desk."
    );
    assert_eq!(intention("Read.", None, None), "I will read.");
    assert_eq!(
        intention("NSDR afterwards", None, Some("Outside")),
        "I will NSDR afterwards outside."
    );
    assert_eq!(
        intention("Walk", Some("  "), None),
        "I will walk.",
        "a blank part is left out"
    );
}

#[test]
fn anchor_line_follows_the_cue() {
    assert_eq!(
        anchor_line(Some("I wake up"), "Drink a glass of water").as_deref(),
        Some("After I wake up, I will drink a glass of water.")
    );
    assert_eq!(
        anchor_line(Some("After I pour my coffee."), "Write the Frog").as_deref(),
        Some("After I pour my coffee, I will write the Frog."),
        "a typed After is not doubled"
    );
    assert_eq!(anchor_line(None, "Walk"), None);
    assert_eq!(
        anchor_line(Some("after"), "Walk").as_deref(),
        Some("After after, I will walk.")
    );
}

#[test]
fn run_line_starts_at_two() {
    assert_eq!(run_line(0), None);
    assert_eq!(run_line(1), None);
    assert_eq!(run_line(2).as_deref(), Some("2 days kept"));
    assert_eq!(run_line(15).as_deref(), Some("15 days kept"));
}

#[test]
fn today_line_by_state() {
    assert_eq!(
        today_line(RoutineToday::NotStarted, 0, 5),
        "Not started today"
    );
    assert_eq!(
        today_line(RoutineToday::InProgress, 2, 5),
        "2 of 5 done today"
    );
    assert_eq!(
        today_line(RoutineToday::Finished, 4, 5),
        "Done today, 4 of 5"
    );
}

#[test]
fn template_steps_carry_optional_and_evidence() {
    let morning = &templates::all()[0];
    let lines: Vec<String> = morning.steps.iter().map(template_step).collect();
    assert_eq!(lines[0], "Drink a glass of water");
    assert_eq!(
        lines[4],
        "Delay caffeine 90–120 minutes (optional). The evidence is contested."
    );
    assert_eq!(lines[5], "Electrolytes (optional)");
}

#[test]
fn copy_is_kind_and_plain() {
    let mut lines = vec![
        FRESH_START.to_owned(),
        today_line(RoutineToday::NotStarted, 0, 3),
        today_line(RoutineToday::InProgress, 1, 3),
        today_line(RoutineToday::Finished, 3, 3),
        run_line(3).unwrap(),
    ];
    for template in templates::all() {
        lines.extend(template.steps.iter().map(template_step));
    }
    for line in lines {
        let lower = line.to_lowercase();
        assert!(!line.contains('!'), "{line}");
        for word in ["missed", "failed", "broken", "streak", "lost"] {
            assert!(!lower.contains(word), "{line}");
        }
    }
}
