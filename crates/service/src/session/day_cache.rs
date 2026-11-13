//! Today's stored sessions, read once per (day start, write generation).
//!
//! The generation is bumped after every successful store write that can add or change a
//! `focus_session` row. A day change or a bump makes the next read go to SQLite; a failed read
//! is never kept, so the next tick retries.

use std::cell::{Cell, RefCell};

use orasenda_core::DaySession;

struct Entry {
    day_start: u64,
    generation: u64,
    sessions: Vec<DaySession>,
}

#[derive(Default)]
pub(super) struct DayCache {
    generation: Cell<u64>,
    entry: RefCell<Option<Entry>>,
    /// How many times `read` ran (store reads), for the tests.
    #[cfg(test)]
    reads: Cell<usize>,
}

impl DayCache {
    /// A row was written (or may have been): the next read goes to the store.
    pub(super) fn bump(&self) {
        self.generation.set(self.generation.get().wrapping_add(1));
    }

    /// The sessions of the day starting at `day_start`: the kept ones when the day and the
    /// generation are the same, else the result of `read` (kept only when it succeeds).
    pub(super) fn get_or_read<E>(
        &self,
        day_start: u64,
        read: impl FnOnce() -> Result<Vec<DaySession>, E>,
    ) -> Result<Vec<DaySession>, E> {
        let generation = self.generation.get();
        if let Some(entry) = &*self.entry.borrow()
            && entry.day_start == day_start
            && entry.generation == generation
        {
            return Ok(entry.sessions.clone());
        }
        #[cfg(test)]
        self.reads.set(self.reads.get() + 1);
        let sessions = read()?;
        *self.entry.borrow_mut() = Some(Entry {
            day_start,
            generation,
            sessions: sessions.clone(),
        });
        Ok(sessions)
    }

    /// Store reads so far (tests).
    #[cfg(test)]
    pub(super) fn reads(&self) -> usize {
        self.reads.get()
    }
}
