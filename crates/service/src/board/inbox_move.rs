//! Inbox to Board: a note becomes a Backlog task, and back, each in one transaction.

use orasenda_store::inbox_notes;
use orasenda_store::tasks::{self, Lane, NewTask, TaskKind};
use uuid::Uuid;

use super::service::{Answer, Changed, live, rank_at};
use super::view::{self, Ctx};
use crate::api::{BoardError, Lane as ApiLane, NoteView, TaskView};
use crate::scheduler::Host;
use crate::session::lock;

/// What a move changed, for the two events.
struct Moved<T> {
    value: T,
    board: Option<Changed>,
    notes: Option<Vec<NoteView>>,
}

/// `inbox_to_task`: makes a Backlog task from a live note and tombstones the note. Emits
/// `inbox-changed` and `board-changed` after the lock.
pub fn run_inbox_to_task<H: Host>(host: &H, note_id: &str) -> Result<TaskView, BoardError> {
    moved(host, |txn, cx| {
        let Some(note) = inbox_notes::list_live(txn)?
            .into_iter()
            .find(|n| n.id == note_id)
        else {
            return Ok(Err(BoardError::NotFound));
        };
        let (title, notes) = super::check::split_note(&note.text);
        let id = Uuid::now_v7().to_string();
        let new = NewTask {
            id: id.clone(),
            title,
            notes,
            tags: Vec::new(),
            kind: TaskKind::Deep,
            estimate: None,
            due: None,
            priority: None,
            checklist: Vec::new(),
            lane: Lane::Backlog,
            rank: rank_at(txn, ApiLane::Backlog, usize::MAX, None)?,
            frog_day: None,
            source_note_id: Some(note.id.clone()),
            created_at: txn.now_ms(),
        };
        tasks::insert(txn, &new)?;
        inbox_notes::remove(txn, &note.id, txn.now_ms())?;
        task_view(txn, &id, cx)
    })
}

/// `task_restore_note`: Undo of *Move to Board*. Tombstones the task and brings its note back.
pub fn run_task_restore_note<H: Host>(host: &H, task_id: &str) -> Result<(), BoardError> {
    moved(host, |txn, _| {
        let Some(task) = live(txn, task_id)? else {
            return Ok(Err(BoardError::NotFound));
        };
        let Some(note_id) = task.source_note_id else {
            return Ok(Err(BoardError::NotFound));
        };
        if !inbox_notes::restore(txn, &note_id)? {
            return Ok(Err(BoardError::NotFound));
        }
        tasks::remove(txn, task_id, txn.now_ms())?;
        Ok(Ok(()))
    })
}

fn task_view(txn: &orasenda_store::Txn, id: &str, cx: Ctx) -> Answer<TaskView> {
    Ok(live(txn, id)?
        .map(|row| view::task_view(&row, cx, None))
        .ok_or(BoardError::Store))
}

fn moved<H: Host, T>(
    host: &H,
    op: impl FnOnce(&mut orasenda_store::Txn, Ctx) -> Answer<T>,
) -> Result<T, BoardError> {
    let service = host.service().ok_or(BoardError::Store)?;
    let now_ms = host.now_ms();
    let Moved {
        value,
        board,
        notes,
    } = {
        let guard = lock(service);
        let (value, board) = guard.board_write(now_ms, op)?;
        let notes = guard
            .inbox_live(now_ms)
            .map_err(|error| eprintln!("board: could not read the notes back ({error})"))
            .ok();
        Moved {
            value,
            board,
            notes,
        }
    };
    if let Some(notes) = notes {
        host.emit_inbox_changed(&notes);
    }
    if let Some((seq, view)) = board {
        host.emit_board_changed(seq, &view);
    }
    Ok(value)
}
