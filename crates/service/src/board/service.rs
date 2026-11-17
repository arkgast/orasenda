//! The store side of the board, run under the service lock.

use orasenda_core::review::week_start;
use orasenda_core::{LocalDate, rank};
use orasenda_store::reflections::{self, ReflectionKind};
use orasenda_store::tasks::{self, NewTask, TaskKind, TaskRow};
use orasenda_store::{StoreError, Txn};

use super::view::{self, Ctx};
use crate::api::{BoardError, BoardView, Lane};
use crate::session::SessionService;

/// A write's answer: the value, or why it was refused before anything was written.
pub(crate) type Answer<T> = Result<Result<T, BoardError>, StoreError>;

/// A board view for `board-changed`, with its sequence number.
pub(crate) type Changed = (u64, BoardView);

impl SessionService {
    /// The words' context at `now_ms`.
    pub(crate) fn board_ctx(&self, now_ms: u64) -> Ctx {
        let today = self.board_today(now_ms);
        Ctx {
            today,
            buffer: self.settings().board_estimate_buffer,
            week_priorities: self.week_priority_ids(today),
        }
    }

    /// The local date at `now_ms`.
    fn board_today(&self, now_ms: u64) -> LocalDate {
        LocalDate::from_epoch_ms(now_ms, self.local_time().utc_offset_min(now_ms))
    }

    /// The task ids chosen by the review of the week `today` falls in, not the week being
    /// planned on a Friday. A failed read is logged and gives none: the flag only decorates.
    fn week_priority_ids(&self, today: LocalDate) -> Vec<String> {
        let Some(store) = self.store() else {
            return Vec::new();
        };
        let id = reflections::reflection_id(ReflectionKind::Week, &week_start(today).to_iso());
        match store.read(|txn| reflections::get(txn, &id)) {
            Ok(row) => row
                .filter(|row| row.deleted_at.is_none())
                .map(|row| row.priorities)
                .unwrap_or_default(),
            Err(error) => {
                eprintln!("board: could not read the week's priorities ({error})");
                Vec::new()
            }
        }
    }

    /// The board at `now_ms`.
    pub(crate) fn board_build(&self, now_ms: u64) -> Result<BoardView, StoreError> {
        let store = self.store().ok_or_else(unavailable)?;
        let cx = self.board_ctx(now_ms);
        let offset = self.local_time().utc_offset_min(now_ms);
        let since = view::done_since(cx.today, offset);
        let rows = store.read(|txn| view::read(txn, since))?;
        let mut board = view::build(&rows, &cx);
        if let Some(running) = self.running_task() {
            for task in board.columns.iter_mut().flat_map(|c| &mut c.tasks) {
                task.active = task.id == running;
            }
        }
        Ok(board)
    }

    /// The next `board-changed` payload. A failed read is logged and gives `None`: the write
    /// already happened.
    pub(crate) fn board_changed(&self, now_ms: u64) -> Option<Changed> {
        match self.board_build(now_ms) {
            Ok(board) => {
                let seq = self.board_seq.get() + 1;
                self.board_seq.set(seq);
                Some((seq, board))
            }
            Err(error) => {
                eprintln!("board: could not read the board back ({error})");
                None
            }
        }
    }

    /// Runs `op` in one write at `now_ms`. Returns its value and, when the write committed and
    /// the read-back worked, the payload for `board-changed`. A refusal writes nothing.
    pub(crate) fn board_write<T>(
        &mut self,
        now_ms: u64,
        op: impl FnOnce(&mut Txn, Ctx) -> Answer<T>,
    ) -> Result<(T, Option<Changed>), BoardError> {
        let store = self.store().ok_or(BoardError::Store)?;
        let cx = self.board_ctx(now_ms);
        let value = store.write(now_ms, |txn| op(txn, cx)).map_err(|error| {
            eprintln!("board: could not write ({error})");
            BoardError::Store
        })??;
        // A task may have been removed or moved to Done: the link follows.
        if self.refresh_task_links(now_ms) {
            self.link_view_owed = true;
        }
        Ok((value, self.board_changed(now_ms)))
    }

    /// The timer view to publish when the last board write changed the linked task.
    pub(crate) fn take_link_view(&mut self, now_ms: u64) -> Option<(u64, crate::api::TimerView)> {
        std::mem::take(&mut self.link_view_owed).then(|| self.snapshot(now_ms))
    }

    /// The payload for `board-changed` when this tick's local date differs from the last
    /// recorded one. The first tick only records the date, and the new date is recorded only
    /// once the view was read, so a failed read retries on the next tick.
    pub(crate) fn board_day_view(&mut self, now_ms: u64) -> Option<Changed> {
        let today = self.board_today(now_ms);
        match self.board_day {
            None => {
                self.board_day = Some(today);
                None
            }
            Some(last) if last == today => None,
            Some(_) => {
                let changed = self.board_changed(now_ms)?;
                self.board_day = Some(today);
                Some(changed)
            }
        }
    }
}

fn unavailable() -> StoreError {
    StoreError::Sqlite("the store is unavailable".into())
}

/// A live task by id.
pub(super) fn live(txn: &Txn, id: &str) -> Result<Option<TaskRow>, StoreError> {
    Ok(tasks::get(txn, id)?.filter(|row| row.deleted_at.is_none()))
}

/// The rank for a task placed at `index` in `lane` (past the end means last), ignoring the
/// task `except` itself.
pub(super) fn rank_at(
    txn: &Txn,
    lane: Lane,
    index: usize,
    except: Option<&str>,
) -> Result<String, StoreError> {
    let stored = view::stored_lane(lane);
    let ranks: Vec<String> = tasks::list_live(txn)?
        .into_iter()
        .filter(|t| t.lane == stored && Some(t.id.as_str()) != except)
        .map(|t| t.rank)
        .collect();
    let index = index.min(ranks.len());
    let before = index.checked_sub(1).and_then(|i| ranks.get(i));
    Ok(rank::between(
        before.map(String::as_str),
        ranks.get(index).map(String::as_str),
    ))
}

/// A new task with `title` (already checked) at the end of Backlog; returns its id. For the
/// weekly review's typed priorities, written in the review's own transaction.
pub(crate) fn append_backlog(txn: &mut Txn, title: String) -> Result<String, StoreError> {
    let id = uuid::Uuid::now_v7().to_string();
    let new = NewTask {
        id: id.clone(),
        title,
        notes: String::new(),
        tags: Vec::new(),
        kind: TaskKind::Deep,
        estimate: None,
        due: None,
        priority: None,
        checklist: Vec::new(),
        lane: tasks::Lane::Backlog,
        rank: rank_at(txn, Lane::Backlog, usize::MAX, None)?,
        frog_day: None,
        source_note_id: None,
        origin: None,
        created_at: txn.now_ms(),
    };
    tasks::insert(txn, &new)?;
    Ok(id)
}
