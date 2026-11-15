//! Writing a chosen preview to the Backlog, undoing it, and opening a source's OS settings
//! (spec 2026-11-15-task-import, Service). The write is the Board's: one store transaction,
//! `board-changed` once after the lock.

use std::collections::BTreeSet;

use orasenda_core::rank;
use orasenda_store::tasks::{self, ChecklistItem, Lane, NewTask, TaskKind};
use uuid::Uuid;

use crate::api::{
    BoardError, ImportDone, ImportError, ImportErrorKind, ImportSourceKind, REMINDERS_UNBUNDLED,
};
use crate::board::{self, stored_priority};
use crate::import::fit::FittedTask;
use crate::import::pending::{LastImport, next_id};
use crate::scheduler::Host;
use crate::session::lock;

const WRITE_LINE: &str = "The tasks weren't imported. Try again.";
const UNDO_LINE: &str = "Orasenda couldn't undo that import. Try again.";

/// `task_import`: appends the rows of preview `preview_id` named by `keys`, in source order,
/// after the Backlog's last rank. The preview is consumed only when the write commits.
pub fn run_task_import<H: Host>(
    host: &H,
    preview_id: u64,
    keys: Vec<u32>,
) -> Result<ImportDone, ImportError> {
    let service = host
        .service()
        .ok_or_else(|| ImportError::store(WRITE_LINE))?;
    // The preview is taken under the first lock, so a second overlapping call answers stale;
    // a failed write puts it back for Try again.
    let (taken, chosen) = {
        let mut guard = lock(service);
        let pending = guard
            .import_pending
            .as_ref()
            .filter(|p| p.id == preview_id)
            .ok_or_else(ImportError::stale)?;
        let wanted: BTreeSet<u32> = keys.iter().copied().collect();
        if wanted.is_empty()
            || wanted
                .iter()
                .any(|k| !pending.tasks.iter().any(|(p, _)| p == k))
        {
            return Err(ImportError::stale());
        }
        let chosen = pending
            .tasks
            .iter()
            .filter(|(key, _)| wanted.contains(key))
            .map(|(_, task)| task.clone())
            .collect::<Vec<FittedTask>>();
        (
            guard.import_pending.take().ok_or_else(ImportError::stale)?,
            chosen,
        )
    };
    let ids = board::write(host, |txn, _| {
        let ranks = rank::spread(tasks::last_backlog_rank(txn)?.as_deref(), chosen.len());
        let mut ids = Vec::with_capacity(chosen.len());
        for (task, rank) in chosen.iter().zip(ranks) {
            let id = Uuid::now_v7().to_string();
            tasks::insert(txn, &new_task(&id, task, rank, txn.now_ms()))?;
            ids.push(id);
        }
        Ok(Ok(ids))
    })
    .map_err(|_| {
        let mut guard = lock(service);
        if guard.import_pending.is_none() && guard.import_last_issued == preview_id {
            guard.import_pending = Some(taken);
        }
        ImportError::store(WRITE_LINE)
    })?;
    let import_id = next_id();
    let count = u32::try_from(ids.len()).unwrap_or(u32::MAX);
    let mut guard = lock(service);
    guard.import_last = Some(LastImport {
        id: import_id,
        task_ids: ids,
    });
    Ok(ImportDone { import_id, count })
}

fn new_task(id: &str, task: &FittedTask, rank: String, now_ms: u64) -> NewTask {
    NewTask {
        id: id.to_owned(),
        title: task.title.clone(),
        notes: task.notes.clone(),
        tags: task.tags.clone(),
        kind: TaskKind::Deep,
        estimate: None,
        due: task.due.clone(),
        priority: task.priority.map(stored_priority),
        checklist: task
            .checklist
            .iter()
            .map(|text| ChecklistItem {
                id: Uuid::now_v7().to_string(),
                text: text.clone(),
                done: false,
            })
            .collect(),
        lane: Lane::Backlog,
        rank,
        frog_day: None,
        source_note_id: None,
        origin: Some(task.origin.clone()),
        created_at: now_ms,
    }
}

/// `task_import_undo`: tombstones the tasks of the last import that are still live, in one
/// write, and answers how many. Another id answers `stale`.
pub fn run_task_import_undo<H: Host>(host: &H, import_id: u64) -> Result<u32, ImportError> {
    let service = host
        .service()
        .ok_or_else(|| ImportError::store(UNDO_LINE))?;
    let task_ids = lock(service)
        .import_last
        .as_ref()
        .filter(|last| last.id == import_id)
        .map(|last| last.task_ids.clone())
        .ok_or_else(ImportError::stale)?;
    let removed = board::write(host, |txn, _| {
        let mut removed = 0u32;
        for id in &task_ids {
            if tasks::remove(txn, id, txn.now_ms())? {
                removed += 1;
            }
        }
        Ok(Ok::<u32, BoardError>(removed))
    })
    .map_err(|_| ImportError::store(UNDO_LINE))?;
    Ok(removed)
}

/// `import_open_settings`: opens the OS pane for the source's permission. Todoist reads a
/// file, so it has none.
pub fn run_import_open_settings<H: Host>(
    host: &H,
    kind: ImportSourceKind,
) -> Result<(), ImportError> {
    let unavailable = |message: &str| ImportError::new(ImportErrorKind::Unavailable, message);
    let result = match kind {
        ImportSourceKind::Reminders => host
            .reminders()
            .ok_or_else(|| unavailable(REMINDERS_UNBUNDLED))?
            .open_settings(),
        ImportSourceKind::Things => host
            .things()
            .ok_or_else(|| unavailable("Things isn't on this Mac."))?
            .open_settings(),
        ImportSourceKind::Todoist => {
            return Err(unavailable("Todoist has no permission to change."));
        }
    };
    result.map_err(|error| {
        eprintln!("import: could not open settings ({error:?})");
        unavailable("Orasenda couldn't open System Settings.")
    })
}
