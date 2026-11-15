//! The import's two memories: the one preview waiting for the user's choice, and the last
//! committed import (for its Undo). Both live on the service and die with the process.

use std::sync::atomic::{AtomicU64, Ordering};

use crate::api::ImportSourceKind;
use crate::import::fit::FittedTask;
use crate::scheduler::Host;
use crate::session::lock;

/// The next preview or import number: one counter for both, per process, from 1.
pub(crate) fn next_id() -> u64 {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    NEXT.fetch_add(1, Ordering::Relaxed)
}

/// The rows shown in a preview, kept to be written when the user chooses.
#[derive(Debug, Clone)]
#[expect(dead_code, reason = "read by the import write (I7b)")]
pub(crate) struct PendingPreview {
    pub id: u64,
    pub source: ImportSourceKind,
    /// `(key, task)` for the rows the preview shows, in source order.
    pub tasks: Vec<(u32, FittedTask)>,
}

/// The tasks the last committed import made, for Undo.
#[derive(Debug, Clone)]
#[expect(dead_code, reason = "written by the import write (I7b)")]
pub(crate) struct LastImport {
    pub id: u64,
    pub task_ids: Vec<String>,
}

/// `import_discard`: drops the pending preview when it is `preview_id`, and only then.
pub fn run_import_discard<H: Host>(host: &H, preview_id: u64) {
    let Some(service) = host.service() else {
        return;
    };
    let mut guard = lock(service);
    if guard
        .import_pending
        .as_ref()
        .is_some_and(|pending| pending.id == preview_id)
    {
        guard.import_pending = None;
    }
}
