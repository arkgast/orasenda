use orasenda_core::platform::import::{DueParts, ReminderItem};

use crate::api::TaskPriority;
use crate::import::reminders::map;

fn item(id: &str) -> ReminderItem {
    ReminderItem {
        id: id.into(),
        title: format!("Task {id}"),
        notes: String::new(),
        url: String::new(),
        list: "Home".into(),
        priority: 0,
        due: None,
        recurring: false,
        created_ms: None,
    }
}

#[test]
fn reminders_priority_mapping() {
    let want = [
        (0, None),
        (1, Some(TaskPriority::High)),
        (4, Some(TaskPriority::High)),
        (5, Some(TaskPriority::Medium)),
        (6, Some(TaskPriority::Low)),
        (9, Some(TaskPriority::Low)),
    ];
    for (raw, expected) in want {
        let mut r = item("a");
        r.priority = raw;
        assert_eq!(map(vec![r])[0].priority, expected, "priority {raw}");
    }
}

#[test]
fn reminders_time_and_repeat_go_to_notes() {
    let mut r = item("a");
    r.notes = "Bring forms".into();
    r.url = "https://example.com".into();
    r.due = Some(DueParts {
        date: Some("2026-11-20".into()),
        time: Some("15:00".into()),
    });
    r.recurring = true;
    let raw = map(vec![r]).remove(0);
    assert_eq!(raw.origin, "reminders:a");
    assert_eq!(raw.title, "Task a");
    assert_eq!(raw.notes, "Bring forms\nhttps://example.com");
    assert_eq!(raw.tags, ["Home"]);
    assert_eq!(raw.due.as_deref(), Some("2026-11-20"));
    assert_eq!(
        raw.date_lines,
        ["Reminders time: 15:00", "Repeats in Reminders"]
    );
}

#[test]
fn reminders_url_alone_and_no_date() {
    let mut r = item("a");
    r.url = "https://example.com".into();
    r.list = String::new();
    let raw = map(vec![r]).remove(0);
    assert_eq!(raw.notes, "https://example.com");
    assert!(raw.tags.is_empty());
    assert_eq!(raw.due, None);
    assert!(raw.date_lines.is_empty());
}

#[test]
fn reminders_order_is_list_created_id() {
    let mut a = item("b");
    a.list = "Work".into();
    let mut b = item("c");
    b.list = "Home".into();
    b.created_ms = Some(20);
    let mut c = item("a");
    c.list = "Home".into();
    c.created_ms = Some(20);
    let mut d = item("z");
    d.list = "Home".into();
    d.created_ms = Some(10);
    let order: Vec<String> = map(vec![a, b, c, d])
        .into_iter()
        .map(|r| r.origin)
        .collect();
    assert_eq!(
        order,
        ["reminders:z", "reminders:a", "reminders:c", "reminders:b"]
    );
}
