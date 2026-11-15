use crate::api::TaskPriority;
use crate::import::fit::{Summary, fit};
use crate::import::item::RawItem;

fn raw(title: &str) -> RawItem {
    RawItem {
        origin: "test:1".into(),
        title: title.into(),
        ..RawItem::default()
    }
}

#[test]
fn plain_item_passes_through() {
    let mut item = raw("  Write report ");
    item.notes = "Outline".into();
    item.tags = vec!["Work".into()];
    item.priority = Some(TaskPriority::High);
    item.due = Some("2026-11-20".into());
    item.checklist = vec!["One".into()];
    let fitted = fit(item);
    let task = fitted.task.clone().expect("kept");
    assert_eq!(task.origin, "test:1");
    assert_eq!(task.title, "Write report");
    assert_eq!(task.notes, "Outline");
    assert_eq!(task.tags, ["Work"]);
    assert_eq!(task.priority, Some(TaskPriority::High));
    assert_eq!(task.due.as_deref(), Some("2026-11-20"));
    assert_eq!(task.checklist, ["One"]);
    assert_eq!(
        Summary::from_fitted(&[fitted]).lines(),
        Vec::<String>::new()
    );
}

#[test]
fn title_over_200_splits_into_notes() {
    let words = "word ".repeat(60);
    let mut item = raw(&words);
    item.notes = "Source notes".into();
    let fitted = fit(item);
    assert!(fitted.shortened);
    let task = fitted.task.clone().expect("kept");
    assert!(task.title.chars().count() <= 200);
    assert!(task.notes.ends_with("\nSource notes"), "{}", task.notes);
    let rest = task.notes.trim_end_matches("\nSource notes");
    assert!(!rest.is_empty());
    assert_eq!(
        format!("{} {}", task.title, rest)
            .split_whitespace()
            .count(),
        60
    );
}

#[test]
fn empty_title_is_skipped_and_counted() {
    let blank = fit(raw("   "));
    assert!(blank.task.is_none());
    let both = Summary::from_fitted(&[blank, fit(raw(""))]);
    assert_eq!(both.lines(), ["2 items with no title were left out."]);
    let one = Summary::from_fitted(&[fit(raw(""))]);
    assert_eq!(one.lines(), ["1 item with no title was left out."]);
}

#[test]
fn tags_cut_dedupe_and_cap() {
    let mut item = raw("Task");
    item.tags = vec![
        " Work ".into(),
        "work".into(),
        "".into(),
        "x".repeat(30),
        "t3".into(),
        "t4".into(),
        "t5".into(),
        "t6".into(),
        "t7".into(),
        "t8".into(),
        "t9".into(),
    ];
    let fitted = fit(item);
    assert!(fitted.tags_over);
    let task = fitted.task.clone().expect("kept");
    assert_eq!(task.tags.len(), 8);
    assert_eq!(task.tags[0], "Work");
    assert_eq!(task.tags[1], "x".repeat(24));
    assert_eq!(task.tags[7], "t8");
    let summary = Summary::from_fitted(&[fitted]);
    assert_eq!(
        summary.lines(),
        ["1 task had more than 8 tags; the rest were left out."]
    );
}

#[test]
fn checklist_over_30_spills_into_notes() {
    let mut item = raw("Task");
    item.notes = "Notes".into();
    item.checklist = (1..=32).map(|n| format!("item {n}")).collect();
    item.checklist[0] = "y".repeat(250);
    let fitted = fit(item);
    assert!(fitted.checklist_over);
    let task = fitted.task.clone().expect("kept");
    assert_eq!(task.checklist.len(), 30);
    assert_eq!(task.checklist[0].chars().count(), 200);
    assert_eq!(
        task.notes,
        format!("Notes\n- {}\n- item 31\n- item 32", "y".repeat(250))
    );
    assert_eq!(
        Summary::from_fitted(&[fitted]).lines(),
        [
            "1 checklist was longer than 30 items; the rest is in its notes.",
            "1 task had a checklist item shortened; the full text is in its notes."
        ]
    );
}

#[test]
fn notes_are_composed_in_order() {
    let mut item = raw(&format!("{} tail", "a".repeat(199)));
    item.notes = "Source".into();
    item.checklist = (0..31).map(|n| n.to_string()).collect();
    item.date_lines = vec!["Reminders time: 15:00".into()];
    let task = fit(item).task.expect("kept");
    assert_eq!(task.notes, "tail\nSource\n- 30\nReminders time: 15:00");
}

#[test]
fn notes_cut_takes_last_part_first() {
    let mut item = raw("Task");
    item.notes = format!("{}\n{}", "a".repeat(5500), "b".repeat(4000));
    item.date_lines = vec!["d".repeat(300); 3];
    let fitted = fit(item);
    assert!(fitted.notes_cut);
    let task = fitted.task.clone().expect("kept");
    assert!(task.notes.chars().count() <= 10_000);
    assert!(task.notes.contains(&"b".repeat(4000)), "source notes stay");
    assert_eq!(task.notes.matches(&"d".repeat(300)).count(), 1);
    assert_eq!(
        task.notes.chars().count(),
        10_000,
        "the crossing line is cut"
    );
    assert_eq!(
        Summary::from_fitted(&[fitted]).lines(),
        ["1 note was cut to fit."]
    );
}

#[test]
fn notes_cut_without_a_line_end_is_hard() {
    let mut item = raw("Task");
    item.notes = "z".repeat(12_000);
    let task = fit(item).task.expect("kept");
    assert_eq!(task.notes.chars().count(), 10_000);
}

#[test]
fn summary_lines_read_as_the_spec_writes_them() {
    let long = "word ".repeat(60);
    let mut many = raw("Task");
    many.checklist = (0..31).map(|n| n.to_string()).collect();
    let fitted = vec![fit(raw(&long)), fit(raw(&long)), fit(raw(&long)), fit(many)];
    let mut summary = Summary::from_fitted(&fitted);
    assert_eq!(
        summary.lines(),
        [
            "3 titles were shortened; the rest is in their notes.",
            "1 checklist was longer than 30 items; the rest is in its notes.",
        ]
    );
    summary.things_checklists = true;
    assert_eq!(
        summary.lines().last().map(String::as_str),
        Some("Things doesn't share checklists, so they stay in Things.")
    );
}

#[test]
fn notes_cut_keeps_the_remainder_and_hard_cuts_one_long_line() {
    let mut item = raw(&"w ".repeat(150));
    item.notes = "z".repeat(12_000);
    let fitted = fit(item);
    assert!(fitted.notes_cut);
    let task = fitted.task.unwrap();
    assert_eq!(task.notes.chars().count(), 10_000);
    assert!(
        task.notes.contains('\n'),
        "remainder stays before the cut line"
    );
}

#[test]
fn long_checklist_item_is_cut_with_full_text_in_notes() {
    let long = "word ".repeat(52);
    let mut item = raw("Task");
    item.checklist = vec![long.trim().to_owned()];
    let fitted = fit(item);
    assert!(fitted.items_cut && !fitted.checklist_over);
    let task = fitted.task.clone().unwrap();
    assert!(task.checklist[0].ends_with("word…"));
    assert!(task.checklist[0].chars().count() <= 200);
    assert_eq!(task.notes, format!("- {}", long.trim()));
    assert_eq!(Summary::from_fitted(&[fitted]).items_cut, 1);
}

#[test]
fn notes_cut_hard_cuts_a_long_line_after_a_short_one() {
    let mut item = raw("Task");
    item.notes = format!("short\n{}", "q".repeat(12_000));
    let fitted = fit(item);
    assert!(fitted.notes_cut);
    let notes = fitted.task.unwrap().notes;
    assert_eq!(notes.chars().count(), 10_000);
    assert!(notes.starts_with("short\nqqq"));
}
