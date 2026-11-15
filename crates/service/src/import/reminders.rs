//! Open reminders as source-neutral items (spec Mapping, Reminders column).

use orasenda_core::platform::import::ReminderItem;

use crate::api::TaskPriority;
use crate::import::dates;
use crate::import::item::RawItem;

/// Items in the spec's order: list title, creation date, id. The origin is `reminders:` and
/// the item's id; the list title is the tag; the URL follows the notes.
pub(crate) fn map(mut items: Vec<ReminderItem>) -> Vec<RawItem> {
    items.sort_by(|a, b| (&a.list, a.created_ms, &a.id).cmp(&(&b.list, b.created_ms, &b.id)));
    items.into_iter().map(raw).collect()
}

fn raw(item: ReminderItem) -> RawItem {
    let notes = [item.notes.trim(), item.url.trim()]
        .iter()
        .filter(|p| !p.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join("\n");
    let mut due = None;
    let mut date_lines = Vec::new();
    if let Some(parts) = &item.due {
        if let Some(date) = &parts.date {
            due = dates::absolute(date);
            if due.is_none() && !date.trim().is_empty() {
                date_lines.push(format!("Reminders date: {}", date.trim()));
            }
        }
        if let Some(time) = parts.time.as_deref().filter(|t| !t.trim().is_empty()) {
            date_lines.push(format!("Reminders time: {}", time.trim()));
        }
    }
    if item.recurring {
        date_lines.push("Repeats in Reminders".to_owned());
    }
    RawItem {
        origin: format!("reminders:{}", item.id),
        title: item.title,
        notes,
        tags: Some(item.list.trim().to_owned())
            .filter(|l| !l.is_empty())
            .into_iter()
            .collect(),
        priority: priority(item.priority),
        due,
        checklist: Vec::new(),
        date_lines,
    }
}

/// 1 to 4 high, 5 medium, 6 to 9 low, 0 (or anything else) none.
fn priority(raw: u8) -> Option<TaskPriority> {
    match raw {
        1..=4 => Some(TaskPriority::High),
        5 => Some(TaskPriority::Medium),
        6..=9 => Some(TaskPriority::Low),
        _ => None,
    }
}
