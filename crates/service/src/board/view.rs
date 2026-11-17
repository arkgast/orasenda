//! Stored tasks as the board shows them: dates worded, time totalled, columns in order.

use orasenda_core::LocalDate;
use orasenda_store::tasks::{self, Priority, TaskRow, Tracked};
use orasenda_store::{StoreError, Txn};

use super::columns;
use crate::api::{
    BoardView, ChecklistItemView, ColumnView, Lane, TaskKind, TaskPriority, TaskView,
};

const DAY_MS: u64 = 86_400_000;
/// Done lists tasks finished within this many local days, today included.
const DONE_DAYS: u64 = 14;
const MONTHS: [&str; 12] = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/// What the words need to know about now.
#[derive(Clone)]
pub(crate) struct Ctx {
    pub today: LocalDate,
    pub buffer: u8,
    /// The task ids the current week's review chose, in saved order (`weekPriority`).
    pub week_priorities: Vec<String>,
}

/// Everything one board view reads from the store.
pub(super) struct Rows {
    live: Vec<TaskRow>,
    done: Vec<TaskRow>,
    tracked: Vec<Tracked>,
    columns: Vec<crate::api::ColumnSettings>,
}

/// Done lists tasks finished since `since`: local midnight, `DONE_DAYS - 1` days before today, so
/// the window moves only at the day roll (when the board is re-emitted).
pub(super) fn done_since(today: LocalDate, offset_min: i32) -> u64 {
    let start = (today.days_since_epoch() - (DONE_DAYS as i64 - 1)) * DAY_MS as i64;
    u64::try_from(start - i64::from(offset_min) * 60_000).unwrap_or(0)
}

pub(super) fn read(txn: &Txn, since: u64) -> Result<Rows, StoreError> {
    Ok(Rows {
        live: tasks::list_live(txn)?,
        done: tasks::list_done_since(txn, since)?,
        tracked: tasks::tracked(txn)?,
        columns: columns::read(txn)?,
    })
}

pub(super) fn build(rows: &Rows, cx: &Ctx) -> BoardView {
    let columns: Vec<ColumnView> = rows
        .columns
        .iter()
        .map(|column| {
            let shown: Vec<&TaskRow> = if column.lane == Lane::Done {
                rows.done.iter().collect()
            } else {
                rows.live
                    .iter()
                    .filter(|t| lane(t.lane) == column.lane)
                    .collect()
            };
            let tasks: Vec<TaskView> = shown
                .into_iter()
                .map(|row| task_view(row, cx, find(&rows.tracked, &row.id)))
                .collect();
            ColumnView {
                lane: column.lane,
                name: column.name.clone(),
                limit: column.limit,
                count: u32::try_from(tasks.len()).unwrap_or(u32::MAX),
                state: columns::state(tasks.len(), column.limit),
                tasks,
            }
        })
        .collect();
    let today_planned = columns
        .iter()
        .filter(|c| c.lane == Lane::Today)
        .flat_map(|c| &c.tasks)
        .filter_map(|t| t.planned)
        .sum();
    BoardView {
        columns,
        buffer: cx.buffer,
        today: cx.today.to_iso(),
        today_planned,
    }
}

fn find<'a>(tracked: &'a [Tracked], id: &str) -> Option<&'a Tracked> {
    tracked.iter().find(|t| t.task_id == id)
}

/// `ceil(estimate * (100 + buffer) / 100)`, in integers.
pub(crate) fn planned(estimate: u8, buffer: u8) -> u32 {
    (u32::from(estimate) * (100 + u32::from(buffer))).div_ceil(100)
}

pub(crate) fn task_view(row: &TaskRow, cx: &Ctx, tracked: Option<&Tracked>) -> TaskView {
    let focused_ms = tracked.map_or(0, |t| t.focused_ms);
    let minutes = focused_ms / 60_000;
    TaskView {
        id: row.id.clone(),
        title: row.title.clone(),
        notes: row.notes.clone(),
        tags: row.tags.clone(),
        kind: match row.kind {
            tasks::TaskKind::Deep => TaskKind::Deep,
            tasks::TaskKind::Shallow => TaskKind::Shallow,
        },
        estimate: row.estimate,
        planned: row.estimate.map(|e| planned(e, cx.buffer)),
        due: row.due.clone(),
        due_label: row.due.as_deref().and_then(|d| due_label(d, cx.today)),
        priority: row.priority.map(|p| match p {
            Priority::High => TaskPriority::High,
            Priority::Medium => TaskPriority::Medium,
            Priority::Low => TaskPriority::Low,
        }),
        checklist: row
            .checklist
            .iter()
            .map(|i| ChecklistItemView {
                id: i.id.clone(),
                text: i.text.clone(),
                done: i.done,
            })
            .collect(),
        lane: lane(row.lane),
        is_frog: row.frog_day.as_deref() == Some(cx.today.to_iso().as_str()),
        breakdown_dismissed: row.breakdown_dismissed,
        source_note_id: row.source_note_id.clone(),
        done_at: row.done_at,
        tracked: format!("{}h {:02}m", minutes / 60, minutes % 60),
        tracked_ms: focused_ms,
        sessions: tracked.map_or(0, |t| t.sessions),
        // The session link is B9's; until then no session runs on a task.
        active: false,
        week_priority: cx.week_priorities.contains(&row.id),
    }
}

pub(crate) fn lane(lane: tasks::Lane) -> Lane {
    match lane {
        tasks::Lane::Backlog => Lane::Backlog,
        tasks::Lane::Today => Lane::Today,
        tasks::Lane::Doing => Lane::Doing,
        tasks::Lane::Done => Lane::Done,
    }
}

pub(crate) fn stored_lane(lane: Lane) -> tasks::Lane {
    match lane {
        Lane::Backlog => tasks::Lane::Backlog,
        Lane::Today => tasks::Lane::Today,
        Lane::Doing => tasks::Lane::Doing,
        Lane::Done => tasks::Lane::Done,
    }
}

/// "Due today", "Due yesterday", "Due tomorrow" or "Due Fri 20 Nov" (the year when it is not
/// this one). Never "overdue". A stored date that doesn't parse has no label.
pub(crate) fn due_label(due: &str, today: LocalDate) -> Option<String> {
    let date = LocalDate::parse_iso(due)?;
    Some(if date == today {
        "Due today".to_owned()
    } else if date == today.pred() {
        "Due yesterday".to_owned()
    } else if date == today.succ() {
        "Due tomorrow".to_owned()
    } else {
        let year = if date.year() == today.year() {
            String::new()
        } else {
            format!(" {}", date.year())
        };
        format!(
            "Due {} {} {}{year}",
            date.weekday().short(),
            date.day(),
            MONTHS[usize::from(date.month() - 1)]
        )
    })
}
