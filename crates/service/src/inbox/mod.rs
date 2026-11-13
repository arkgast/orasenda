//! The Inbox in the service: capture a note, list the live ones, remove and restore.
//!
//! Like the session's free functions, each `run_*` locks the [`SessionService`] for the store
//! write and its read-back, then emits `inbox-changed` after the lock is released.

mod service;
#[cfg(test)]
mod tests;
mod view;

pub use view::note_view;

use service::{Changed, checked};

use crate::api::{CaptureError, InboxError, NewCapture, NoteView};
use crate::scheduler::Host;
use crate::session::lock;

/// `capture_note`: trims, checks and saves a note, then emits `inbox-changed`. Returns the
/// saved note.
pub fn run_capture_note<H: Host>(host: &H, note: NewCapture) -> Result<NoteView, CaptureError> {
    let text = checked(&note)?;
    let service = host.service().ok_or(CaptureError::Store)?;
    let now_ms = host.now_ms();
    let (saved, notes) = lock(service)
        .inbox_insert(text, note.kind, now_ms)
        .map_err(|error| {
            eprintln!("inbox: could not save a note ({error})");
            CaptureError::Store
        })?;
    if let Some(notes) = notes {
        host.emit_inbox_changed(&notes);
    }
    Ok(saved)
}

/// `inbox_list`: the live notes, newest first. A store that cannot be read is an error, never
/// an empty Inbox.
pub fn run_inbox_list<H: Host>(host: &H) -> Result<Vec<NoteView>, InboxError> {
    let service = host.service().ok_or(InboxError::Store)?;
    lock(service).inbox_live(host.now_ms()).map_err(|error| {
        eprintln!("inbox: could not list notes ({error})");
        InboxError::Store
    })
}

/// `inbox_remove`: tombstones a note, then emits `inbox-changed`.
pub fn run_inbox_remove<H: Host>(host: &H, id: &str) -> Result<(), InboxError> {
    set_removed(host, id, true)
}

/// `inbox_restore`: brings a removed note back, then emits `inbox-changed`.
pub fn run_inbox_restore<H: Host>(host: &H, id: &str) -> Result<(), InboxError> {
    set_removed(host, id, false)
}

fn set_removed<H: Host>(host: &H, id: &str, remove: bool) -> Result<(), InboxError> {
    let service = host.service().ok_or(InboxError::Store)?;
    let changed = lock(service).inbox_set_removed(id, remove, host.now_ms());
    match changed {
        Changed::Done(notes) => {
            if let Some(notes) = notes {
                host.emit_inbox_changed(&notes);
            }
            Ok(())
        }
        Changed::Nothing => Err(InboxError::NotFound),
        Changed::Failed => Err(InboxError::Store),
    }
}
