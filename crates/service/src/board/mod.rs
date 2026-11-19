//! The Board in the service (spec 2026-11-14, §Service and IPC): tasks in four columns, their
//! limits, the Frog, the Inbox move and the `board-changed` event.
//!
//! Like the Inbox, each `run_*` locks the [`SessionService`](crate::session::SessionService)
//! for the store write and its read-back, then emits `board-changed` after the lock is
//! released. A store that can't be read is an error, never an empty board.

pub(crate) mod check;
pub(crate) mod columns;
mod doing;
mod inbox_move;
pub(crate) mod orphans;
mod service;
#[cfg(test)]
mod tests;
pub(crate) mod view;

pub use columns::{
    run_board_column_add, run_board_column_edit, run_board_column_fold, run_board_column_remove,
};
pub(crate) use doing::move_to_doing;
pub use inbox_move::{run_inbox_to_task, run_task_restore_note};

use orasenda_store::tasks::{self, NewTask, TaskPatch};
use orasenda_store::{StoreError, Txn};
use uuid::Uuid;

use crate::api::{
    BoardError, BoardView, Lane, TaskDraft, TaskKind, TaskPatchView, TaskPriority, TaskView,
};
use crate::scheduler::Host;
use crate::session::lock;
pub(crate) use service::Answer;
pub(crate) use service::Changed;
pub(crate) use service::append_backlog;
use service::{live, rank_at};
use view::{Ctx, stored_lane};

/// `board_get`: the whole board.
pub fn run_board_get<H: Host>(host: &H) -> Result<BoardView, BoardError> {
    let service = host.service().ok_or(BoardError::Store)?;
    lock(service).board_build(host.now_ms()).map_err(|error| {
        eprintln!("board: could not read the board ({error})");
        BoardError::Store
    })
}

/// Whether `lane` is a column on this board. A lane that isn't is refused as `ColumnNotFound`.
fn on_board(txn: &Txn, lane: &Lane) -> Result<bool, StoreError> {
    Ok(columns::read(txn)?.iter().any(|c| c.lane == *lane))
}

/// `task_add`: trims, checks and saves a task at the end of its column (Backlog unless said).
pub fn run_task_add<H: Host>(host: &H, draft: TaskDraft) -> Result<TaskView, BoardError> {
    let title = check::title(&draft.title)?;
    let notes = check::notes(draft.notes.as_deref().unwrap_or_default())?;
    let tags = check::tags(draft.tags.as_deref().unwrap_or_default())?;
    let estimate = draft.estimate.map(check::estimate).transpose()?;
    let due = draft.due.as_deref().map(check::due).transpose()?;
    let lane = draft.lane.unwrap_or(Lane::BACKLOG);
    write(host, |txn, cx| {
        if !on_board(txn, &lane)? {
            return Ok(Err(BoardError::ColumnNotFound));
        }
        let id = Uuid::now_v7().to_string();
        let stored = stored_lane(&lane)?;
        let new = NewTask {
            id: id.clone(),
            title,
            notes,
            tags,
            kind: match draft.kind.unwrap_or(TaskKind::Deep) {
                TaskKind::Deep => tasks::TaskKind::Deep,
                TaskKind::Shallow => tasks::TaskKind::Shallow,
            },
            estimate,
            due,
            priority: draft.priority.map(stored_priority),
            checklist: Vec::new(),
            rank: rank_at(txn, &stored, usize::MAX, None)?,
            lane: stored,
            frog_day: None,
            source_note_id: None,
            origin: None,
            created_at: txn.now_ms(),
        };
        tasks::insert(txn, &new)?;
        Ok(live(txn, &id)?
            .map(|row| view::task_view(&row, &cx, None))
            .ok_or(BoardError::Store))
    })
}

/// `task_update`: saves the fields of the patch.
pub fn run_task_update<H: Host>(
    host: &H,
    id: &str,
    patch: &TaskPatchView,
) -> Result<(), BoardError> {
    let stored = TaskPatch {
        title: patch.title.as_deref().map(check::title).transpose()?,
        notes: patch.notes.as_deref().map(check::notes).transpose()?,
        tags: patch.tags.as_deref().map(check::tags).transpose()?,
        kind: patch.kind.map(|k| match k {
            TaskKind::Deep => tasks::TaskKind::Deep,
            TaskKind::Shallow => tasks::TaskKind::Shallow,
        }),
        estimate: match patch.estimate {
            None => None,
            Some(None) => Some(None),
            Some(Some(n)) => Some(Some(check::estimate(n)?)),
        },
        due: match &patch.due {
            None => None,
            Some(None) => Some(None),
            Some(Some(d)) => Some(Some(check::due(d)?)),
        },
        priority: patch.priority.map(|p| p.map(stored_priority)),
        checklist: patch
            .checklist
            .as_deref()
            .map(check::checklist)
            .transpose()?,
        breakdown_dismissed: patch.breakdown_dismissed,
    };
    write(host, |txn, _| {
        if live(txn, id)?.is_none() {
            return Ok(Err(BoardError::NotFound));
        }
        tasks::update(txn, id, &stored)?;
        Ok(Ok(()))
    })
}

/// `task_move`: moves a task to `lane` at `index` (past the end means last).
pub fn run_task_move<H: Host>(
    host: &H,
    id: &str,
    lane: Lane,
    index: u32,
) -> Result<(), BoardError> {
    write(host, |txn, _| {
        if !on_board(txn, &lane)? {
            return Ok(Err(BoardError::ColumnNotFound));
        }
        if live(txn, id)?.is_none() {
            return Ok(Err(BoardError::NotFound));
        }
        let index = usize::try_from(index).unwrap_or(usize::MAX);
        let stored = stored_lane(&lane)?;
        let rank = rank_at(txn, &stored, index, Some(id))?;
        tasks::move_to(txn, id, stored, &rank)?;
        Ok(Ok(()))
    })
}

/// `task_set_frog`: makes a task today's Frog (answering the Frog it replaced, for Undo) or
/// clears it. A Done task can't be made the Frog.
pub fn run_task_set_frog<H: Host>(
    host: &H,
    id: &str,
    on: bool,
) -> Result<Option<String>, BoardError> {
    write(host, |txn, cx: Ctx| {
        let Some(task) = live(txn, id)? else {
            return Ok(Err(BoardError::NotFound));
        };
        if !on {
            tasks::clear_frog(txn, id)?;
            return Ok(Ok(None));
        }
        if task.lane == tasks::Lane::DONE {
            return Ok(Err(BoardError::DoneCannotBeFrog));
        }
        Ok(Ok(tasks::set_frog(txn, id, &cx.today.to_iso())?.flatten()))
    })
}

/// `task_remove`: tombstones a task (it can be brought back).
pub fn run_task_remove<H: Host>(host: &H, id: &str) -> Result<(), BoardError> {
    set_removed(host, id, true)
}

/// `task_restore`: brings a removed task back.
pub fn run_task_restore<H: Host>(host: &H, id: &str) -> Result<(), BoardError> {
    set_removed(host, id, false)
}

fn set_removed<H: Host>(host: &H, id: &str, remove: bool) -> Result<(), BoardError> {
    write(host, |txn, _| {
        let changed = if remove {
            tasks::remove(txn, id, txn.now_ms())?
        } else {
            tasks::restore(txn, id)?
        };
        if !changed {
            return Ok(Err(BoardError::NotFound));
        }
        if !remove {
            // Undo into a column that is gone: the task lands at the end of Backlog.
            if let Some(task) = live(txn, id)?
                && !on_board(txn, &Lane::from_stored(&task.lane))?
            {
                tasks::move_to_backlog_end(txn, &[id.to_owned()])?;
            }
        }
        Ok(Ok(()))
    })
}

pub(crate) fn stored_priority(priority: TaskPriority) -> tasks::Priority {
    match priority {
        TaskPriority::High => tasks::Priority::High,
        TaskPriority::Medium => tasks::Priority::Medium,
        TaskPriority::Low => tasks::Priority::Low,
    }
}

/// Locks the service, runs `op` in one write and reads the board back, then emits
/// `board-changed` after the lock is released.
///
/// When the write commits but the read-back fails, the command still answers `Ok`, no event
/// follows and the failure is logged at error level (`board_changed`). `useBoard` re-reads
/// with `board_get` when an ok answer brings no event.
pub(crate) fn write<H: Host, T>(
    host: &H,
    op: impl FnOnce(&mut Txn, Ctx) -> Answer<T>,
) -> Result<T, BoardError> {
    let service = host.service().ok_or(BoardError::Store)?;
    let now_ms = host.now_ms();
    let (value, changed, timer) = {
        let mut guard = lock(service);
        let (value, changed) = guard.board_write(now_ms, op)?;
        (value, changed, guard.take_link_view(now_ms))
    };
    if let Some((seq, view)) = changed {
        host.emit_board_changed(seq, &view);
    }
    if let Some((seq, view)) = timer {
        crate::scheduler::publish_view(host, seq, &view);
    }
    Ok(value)
}
