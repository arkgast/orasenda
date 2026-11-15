//! The words of a preview row: its meta line and its "already on the Board" line.

use orasenda_store::tasks;

use crate::api::{ColumnSettings, ImportItemView, Lane};
use crate::board::view::{Ctx, due_label, lane};
use crate::import::fit::FittedTask;

/// `Work · Planning · Due Fri 20 Nov · 4 checklist items`; the parts that exist, in that order.
pub(crate) fn meta(task: &FittedTask, cx: Ctx) -> String {
    let mut parts = Vec::new();
    if !task.tags.is_empty() {
        parts.push(task.tags.join(" · "));
    }
    if let Some(label) = task.due.as_deref().and_then(|d| due_label(d, cx.today)) {
        parts.push(label);
    }
    match task.checklist.len() {
        0 => {}
        1 => parts.push("1 checklist item".to_owned()),
        n => parts.push(format!("{n} checklist items")),
    }
    parts.join(" · ")
}

/// What the store knows about one origin: its first live lane (board lane order), if any.
pub(crate) fn live_lane(found: &[(String, tasks::Lane, bool)], origin: &str) -> Option<Lane> {
    found
        .iter()
        .find(|(o, _, live)| *live && o == origin)
        .map(|(_, l, _)| lane(*l))
}

/// The row for `task`: unselected with a why line when a live task holds its origin, selected
/// otherwise (a removed-only match counts as new, so an undone import can be redone).
pub(crate) fn item(
    key: u32,
    task: &FittedTask,
    on_board: Option<Lane>,
    columns: &[ColumnSettings],
    cx: Ctx,
) -> ImportItemView {
    let why = on_board.map(|l| {
        let name = columns
            .iter()
            .find(|c| c.lane == l)
            .map_or("the Board", |c| c.name.as_str());
        format!("Already on the Board, in {name}")
    });
    ImportItemView {
        key,
        title: task.title.clone(),
        meta: meta(task, cx),
        why,
        selected: on_board.is_none(),
        on_board,
    }
}
