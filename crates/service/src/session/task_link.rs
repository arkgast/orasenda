//! The task a session is for (spec 2026-11-14, §Session ↔ task): the optional choice, the
//! check at every start, the move to Doing and the title cache behind `TimerView.task`.
//!
//! Nothing is chosen automatically. The choice is the person's, set by `timer_set_task`.

use std::collections::HashMap;

use orasenda_store::tasks::{self, Lane, TaskRow};

use super::*;
use crate::api::{
    BoardNotice, BoardNoticeKind, StartRequest, TimerCommandError, TimerCommandErrorKind, TimerTask,
};

const GONE: &str = "That task is gone. Pick another or start without one.";
const NO_BOARD: &str = "Orasenda couldn't read the board. Try again.";
const IN_DONE: &str = "Move it out of Done first.";

fn refused(kind: TimerCommandErrorKind, message: &str) -> TimerCommandError {
    TimerCommandError {
        kind,
        message: message.into(),
    }
}

impl SessionService {
    /// The task shown: the session's while one exists, else the one chosen for the next start.
    /// A title comes from the cache only, so a tick never reads the store.
    pub(super) fn task_view(&self) -> Option<TimerTask> {
        let id = if self.engine.is_idle() {
            self.carry_task.as_deref().or(self.chosen_task.as_deref())
        } else {
            self.engine.task_id()
        }?;
        let title = self.task_titles.get(id)?;
        Some(TimerTask {
            id: id.to_owned(),
            title: title.clone(),
        })
    }

    /// The task the live session is for; none while idle.
    pub(crate) fn running_task(&self) -> Option<&str> {
        self.engine.task_id()
    }

    /// A live task that is not in Done, or why it can't be linked.
    fn check_task(&self, id: &str) -> Result<TaskRow, TimerCommandError> {
        let Some(store) = &self.store else {
            return Err(refused(TimerCommandErrorKind::Store, NO_BOARD));
        };
        match store.read(|txn| tasks::get(txn, id)) {
            Ok(Some(row)) if row.deleted_at.is_none() && row.lane == Lane::DONE => {
                Err(refused(TimerCommandErrorKind::TaskDone, IN_DONE))
            }
            Ok(Some(row)) if row.deleted_at.is_none() => Ok(row),
            Ok(_) => Err(refused(TimerCommandErrorKind::TaskNotFound, GONE)),
            Err(error) => {
                eprintln!("session: could not read the task ({error})");
                Err(refused(TimerCommandErrorKind::Store, NO_BOARD))
            }
        }
    }

    /// The task a start links: the request's, else the previous session's after a *Keep going*
    /// or a roll-on, else the choice, else none. A task the request names that can't be
    /// linked refuses the start; a stale choice is dropped and the session starts without it.
    pub(super) fn pick_start_task(
        &mut self,
        request: &StartRequest,
    ) -> Result<Option<String>, TimerCommandError> {
        let carried = self.carry_task.take();
        if let Some(id) = &request.task_id {
            // The store can't say: link it by id, the move to Doing reports the failure.
            match self.check_task(id) {
                Ok(row) => {
                    self.task_titles.insert(row.id, row.title);
                }
                Err(error) if error.kind == TimerCommandErrorKind::Store => {}
                Err(error) => return Err(error),
            }
            return Ok(Some(id.clone()));
        }
        let Some(id) = carried.or_else(|| self.chosen_task.clone()) else {
            return Ok(None);
        };
        match self.check_task(&id) {
            Ok(row) => {
                self.task_titles.insert(row.id, row.title);
                Ok(Some(id))
            }
            // The store can't say: link it by id, the move to Doing reports the failure.
            Err(error) if error.kind == TimerCommandErrorKind::Store => Ok(Some(id)),
            Err(_) => {
                if self.chosen_task.as_deref() == Some(id.as_str()) {
                    self.chosen_task = None;
                }
                Ok(None)
            }
        }
    }

    /// A session started on `id`: it moves to Doing. A failed board write is reported and the
    /// session goes on.
    pub(super) fn link_started(&mut self, id: &str, now_ms: u64) {
        self.board_dirty = true;
        let Some(store) = &self.store else {
            return;
        };
        let moved = store.write(now_ms, |txn| crate::board::move_to_doing(txn, id));
        self.notice_owed = match moved {
            Ok(Some(title)) => Some(BoardNotice {
                kind: BoardNoticeKind::MovedBack,
                message: format!("Moved {title} back to Today."),
            }),
            Ok(None) => return,
            Err(error) => {
                eprintln!("session: could not move the task to Doing ({error})");
                Some(BoardNotice {
                    kind: BoardNoticeKind::NotSaved,
                    message: "The board didn't update. Try again.".into(),
                })
            }
        };
    }

    /// `timer_set_task`: while idle sets or clears the choice; while a focus runs changes the
    /// live session's task; during a break changes the finished focus's task.
    pub(super) fn set_task(
        &mut self,
        task: Option<String>,
        now_ms: u64,
    ) -> Result<(), TimerCommandError> {
        if let Some(id) = &task {
            let row = self.check_task(id)?;
            self.task_titles.insert(row.id, row.title);
        }
        if self.engine.is_idle() {
            self.chosen_task = task;
            self.carry_task = None;
        } else if self
            .engine
            .set_task(task, now_ms)
            .map_err(TimerCommandError::from)?
        {
            self.persist(now_ms, Vec::new());
            self.board_dirty = true;
        }
        Ok(())
    }

    /// Re-reads the chosen and the session's task after a board write, an import or a launch:
    /// the choice clears when its task is removed or in Done, the session's link clears when
    /// its task is removed, and the titles are refreshed. True when the shown task changed.
    pub(crate) fn refresh_task_links(&mut self, now_ms: u64) -> bool {
        let before = self.task_view();
        let session = self.engine.task_id().map(str::to_owned);
        let ids: Vec<String> = self
            .chosen_task
            .iter()
            .chain(&self.carry_task)
            .chain(&session)
            .cloned()
            .collect();
        let Some(store) = &self.store else {
            return false;
        };
        let read = store.read(|txn| {
            ids.iter()
                .map(|id| Ok((id.clone(), tasks::get(txn, id)?)))
                .collect::<Result<HashMap<_, _>, orasenda_store::StoreError>>()
        });
        let rows = match read {
            Ok(rows) => rows,
            Err(error) => {
                eprintln!("session: could not refresh the linked task ({error})");
                return false;
            }
        };
        let live = |id: &str| rows.get(id).and_then(|r| r.as_ref());
        if let Some(id) = self.chosen_task.clone()
            && !live(&id).is_some_and(|r| r.deleted_at.is_none() && r.lane != Lane::DONE)
        {
            self.chosen_task = None;
        }
        if let Some(id) = self.carry_task.clone()
            && !live(&id).is_some_and(|r| r.deleted_at.is_none() && r.lane != Lane::DONE)
        {
            self.carry_task = None;
        }
        let mut cleared = false;
        if let Some(id) = &session
            && live(id).is_some_and(|r| r.deleted_at.is_some())
        {
            cleared = self.engine.set_task(None, now_ms).unwrap_or(false);
        }
        self.task_titles = rows
            .values()
            .flatten()
            .filter(|r| r.deleted_at.is_none())
            .map(|r| (r.id.clone(), r.title.clone()))
            .collect();
        if cleared {
            self.persist(now_ms, Vec::new());
        }
        before != self.task_view()
    }
}
