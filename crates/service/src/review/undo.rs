//! Moving the shutdown's unfinished tasks to the Backlog, and the one Undo for it. The lanes
//! before the move live in memory behind an opaque token (ADR-013): one at a time, ten minutes.

use orasenda_store::tasks::{self, Lane as Stored, LaneBefore};
use uuid::Uuid;

use super::state::UndoSlot;
use super::{changed_view, emit_changed, words};
use crate::api::{MoveUndo, ReviewError};
use crate::scheduler::{Host, publish_view};
use crate::session::lock;

/// How long a move can be undone.
const UNDO_MS: u64 = 10 * 60_000;

/// `shutdown_move`: sends the Today and Doing tasks in `ids` to the end of the Backlog in one
/// write. A task with a running session stays where it is, and so does one that is no longer
/// in Today or Doing. With nothing left to move the answer is `NotFound`. The new token
/// replaces any earlier one.
pub fn run_shutdown_move<H: Host>(host: &H, ids: Vec<String>) -> Result<MoveUndo, ReviewError> {
    let service = host.service().ok_or(ReviewError::Store)?;
    let now_ms = host.now_ms();
    let (undo, board, timer, review) = {
        let mut guard = lock(service);
        let running = guard.running_task().map(str::to_owned);
        let (moved, board) = guard
            .board_write(now_ms, |txn, _| {
                let mut movable = Vec::new();
                for id in &ids {
                    let ok = tasks::get(txn, id)?.is_some_and(|row| {
                        row.deleted_at.is_none()
                            && matches!(row.lane, Stored::Today | Stored::Doing)
                    });
                    if ok && running.as_deref() != Some(id.as_str()) {
                        movable.push(id.clone());
                    }
                }
                Ok(Ok(tasks::move_to_backlog_end(txn, &movable)?))
            })
            .map_err(|_| ReviewError::Store)?;
        if moved.is_empty() {
            return Err(ReviewError::NotFound);
        }
        let line = words::move_line(u32::try_from(moved.len()).unwrap_or(u32::MAX));
        let token = Uuid::now_v7().to_string();
        guard.review.undo = Some(UndoSlot {
            token: token.clone(),
            expires_at: now_ms.saturating_add(UNDO_MS),
            lanes: moved,
        });
        (
            MoveUndo { token, line },
            board,
            guard.take_link_view(now_ms),
            changed_view(&guard, now_ms),
        )
    };
    emit_all(host, board, timer, review);
    Ok(undo)
}

/// `shutdown_move_undo`: puts the last move's tasks back in their lanes and ranks, and answers
/// the line to show. An expired, spent or replaced token answers `NotFound`.
pub fn run_shutdown_move_undo<H: Host>(host: &H, token: &str) -> Result<String, ReviewError> {
    let service = host.service().ok_or(ReviewError::Store)?;
    let now_ms = host.now_ms();
    let (line, board, timer, review) = {
        let mut guard = lock(service);
        let slot = match guard.review.undo.take() {
            Some(slot) if slot.token == token && now_ms < slot.expires_at => slot,
            Some(slot) if slot.token != token => {
                // Not this slot's token: leave the live one for its own holder.
                guard.review.undo = Some(slot);
                return Err(ReviewError::NotFound);
            }
            _ => return Err(ReviewError::NotFound),
        };
        let lanes: Vec<LaneBefore> = slot.lanes.clone();
        let restored = guard.board_write(now_ms, |txn, _| {
            tasks::restore_lanes(txn, &lanes)?;
            Ok(Ok(()))
        });
        let Ok((_, board)) = restored else {
            // The write failed and nothing changed: the person can try again.
            guard.review.undo = Some(slot);
            return Err(ReviewError::Store);
        };
        (
            words::put_back_line(u32::try_from(lanes.len()).unwrap_or(u32::MAX)),
            board,
            guard.take_link_view(now_ms),
            changed_view(&guard, now_ms),
        )
    };
    emit_all(host, board, timer, review);
    Ok(line)
}

/// Emits what a move changed, with the service lock released.
fn emit_all<H: Host>(
    host: &H,
    board: Option<crate::board::Changed>,
    timer: Option<(u64, crate::api::TimerView)>,
    review: Option<crate::api::ReviewView>,
) {
    if let Some((seq, view)) = board {
        host.emit_board_changed(seq, &view);
    }
    if let Some((seq, view)) = timer {
        publish_view(host, seq, &view);
    }
    if let Some(view) = review {
        emit_changed(host, &view);
    }
}
