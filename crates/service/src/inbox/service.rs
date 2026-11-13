//! The store side of the Inbox, run under the service lock.

use orasenda_store::inbox_notes::{self, NewNote, NoteKind as StoredKind, NoteRow};
use orasenda_store::{Store, StoreError};
use uuid::Uuid;

use super::view::note_view;
use crate::api::{CaptureError, NewCapture, NoteKind, NoteView};
use crate::session::SessionService;

/// The most characters a note holds, after trimming.
pub(super) const MAX_CHARS: usize = 1000;

/// What a write to one note found.
pub(super) enum Changed {
    /// The write committed. The live notes after it, newest first, when they could be read
    /// back (the event needs them; the write does not).
    Done(Option<Vec<NoteView>>),
    /// No live or removed note to change.
    Nothing,
    /// The store is unavailable or failed.
    Failed,
}

impl SessionService {
    fn views(&self, store: &Store, now_ms: u64) -> Result<Vec<NoteView>, StoreError> {
        let rows = store.read(inbox_notes::list_live)?;
        Ok(rows
            .iter()
            .map(|row| note_view(row, now_ms, self.local_time()))
            .collect())
    }

    /// Inserts a trimmed, checked note. Returns the saved note and, when the read-back worked,
    /// the live notes for the event.
    pub(super) fn inbox_insert(
        &self,
        text: String,
        kind: NoteKind,
        now_ms: u64,
    ) -> Result<(NoteView, Option<Vec<NoteView>>), StoreError> {
        let store = self.store().ok_or_else(unavailable)?;
        let note = NewNote {
            id: Uuid::now_v7().to_string(),
            text,
            kind: match kind {
                NoteKind::Internal => StoredKind::Internal,
                NoteKind::External => StoredKind::External,
            },
            created_at: now_ms,
        };
        store.write(now_ms, |txn| inbox_notes::insert(txn, &note))?;
        let saved = note_view(
            &NoteRow {
                id: note.id,
                text: note.text,
                kind: note.kind,
                created_at: now_ms,
                deleted_at: None,
            },
            now_ms,
            self.local_time(),
        );
        Ok((saved, self.read_back(store, now_ms)))
    }

    /// The live notes after a committed write. A failed read is logged, not an error: the
    /// write already happened.
    fn read_back(&self, store: &Store, now_ms: u64) -> Option<Vec<NoteView>> {
        self.views(store, now_ms)
            .map_err(|error| eprintln!("inbox: could not read the notes back ({error})"))
            .ok()
    }

    /// The live notes, newest first.
    pub(crate) fn inbox_live(&self, now_ms: u64) -> Result<Vec<NoteView>, StoreError> {
        self.views(self.store().ok_or_else(unavailable)?, now_ms)
    }

    /// Removes (`remove`) or restores a note.
    pub(super) fn inbox_set_removed(&self, id: &str, remove: bool, now_ms: u64) -> Changed {
        let Some(store) = self.store() else {
            return Changed::Failed;
        };
        let changed = store.write(now_ms, |txn| {
            if remove {
                inbox_notes::remove(txn, id, now_ms)
            } else {
                inbox_notes::restore(txn, id)
            }
        });
        match changed {
            Ok(false) => Changed::Nothing,
            Ok(true) => Changed::Done(self.read_back(store, now_ms)),
            Err(error) => {
                eprintln!("inbox: could not change a note ({error})");
                Changed::Failed
            }
        }
    }
}

fn unavailable() -> StoreError {
    StoreError::Sqlite("the store is unavailable".into())
}

/// A capture's text trimmed, or why it is refused.
pub(super) fn checked(note: &NewCapture) -> Result<String, CaptureError> {
    let text = note.text.trim();
    if text.is_empty() {
        Err(CaptureError::Empty)
    } else if text.chars().count() > MAX_CHARS {
        Err(CaptureError::TooLong)
    } else {
        Ok(text.to_owned())
    }
}
