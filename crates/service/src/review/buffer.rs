//! The estimate buffer suggestion (spec 2026-11-16, *Buffer suggestion*): the Done tasks that
//! had an estimate and counted focus sessions, the threshold in core, and *Not now*.
//!
//! Nothing here changes the Board's buffer; the suggestion is shown only when its value
//! differs from the current setting and the person hasn't set it aside in the last 28 days.

use orasenda_core::LocalDate;
use orasenda_core::review::suggest;
use orasenda_store::tasks::TaskRow;
use orasenda_store::{StoreError, Txn, focus_sessions, meta, tasks};

use super::stats::{local_start_ms, shift};
use super::words;
use crate::api::{BufferSuggestionView, ReviewError};
use crate::scheduler::Host;
use crate::session::lock;

/// The device-only `meta` key holding when *Not now* was pressed, in epoch milliseconds.
const META_DISMISSED: &str = "hint.buffer_suggestion";
/// How long *Not now* hides the suggestion.
const HIDDEN_MS: u64 = 28 * 24 * 60 * 60 * 1000;
/// A session counts toward the buffer from 5 focused minutes.
const MIN_FOCUSED_MS: u64 = 5 * 60 * 1000;
/// Local days the suggestion looks back, today included.
const WINDOW_DAYS: i32 = 56;

/// The Done tasks of `rows` that had an estimate and at least one counted session, as
/// (done day, estimated sessions, counted sessions). Counted sessions are focus rows of 5
/// focused minutes or more linked to the task.
pub(super) fn estimated_with_counts(
    txn: &Txn,
    rows: &[TaskRow],
    offset_min: i32,
) -> Result<Vec<(LocalDate, u8, u32)>, StoreError> {
    let ids: Vec<String> = rows
        .iter()
        .filter(|task| task.estimate.is_some())
        .map(|task| task.id.clone())
        .collect();
    let counted = focus_sessions::counted_for_tasks(txn, &ids, MIN_FOCUSED_MS)?;
    Ok(rows
        .iter()
        .filter_map(|task| {
            let estimate = task.estimate.filter(|n| *n > 0)?;
            let done_at = task.done_at?;
            let (_, n) = counted.iter().find(|(id, _)| *id == task.id)?;
            Some((LocalDate::from_epoch_ms(done_at, offset_min), estimate, *n))
        })
        .collect())
}

/// The suggestion to show now, or `None` under the threshold, when it equals the Board's
/// `current` buffer, or while it is set aside.
pub(super) fn suggestion(
    txn: &Txn,
    today: LocalDate,
    offset_min: i32,
    now_ms: u64,
    current: u8,
) -> Result<Option<BufferSuggestionView>, StoreError> {
    if set_aside(txn, now_ms)? {
        return Ok(None);
    }
    let since = local_start_ms(shift(today, 1 - WINDOW_DAYS), offset_min);
    let done = tasks::list_done_since(txn, since)?;
    let eligible = estimated_with_counts(txn, &done, offset_min)?;
    let Some(found) = suggest(&eligible, today).filter(|found| found.percent != current) else {
        return Ok(None);
    };
    Ok(Some(BufferSuggestionView {
        percent: found.percent,
        line: words::buffer_line(found.tasks, found.estimated, found.actual, found.percent),
        action: words::buffer_action(found.percent),
    }))
}

/// Whether *Not now* was pressed in the last 28 days. A stored value that isn't a time is
/// logged and ignored, so the suggestion can show again.
fn set_aside(txn: &Txn, now_ms: u64) -> Result<bool, StoreError> {
    let Some(stored) = meta::get(txn, META_DISMISSED)? else {
        return Ok(false);
    };
    let Ok(at) = stored.parse::<u64>() else {
        eprintln!("review: {META_DISMISSED} holds {stored:?}, not a time; ignoring it");
        return Ok(false);
    };
    Ok(at <= now_ms && now_ms - at < HIDDEN_MS)
}

/// `buffer_suggestion_dismiss`: *Not now*. Records the time on this device only (no
/// `change_log` row), which hides the suggestion for 28 days. The buffer is not touched.
pub fn run_buffer_suggestion_dismiss<H: Host>(host: &H) -> Result<(), ReviewError> {
    let service = host.service().ok_or(ReviewError::Store)?;
    let now_ms = host.now_ms();
    let guard = lock(service);
    let store = guard.store().ok_or(ReviewError::Store)?;
    store
        .write(now_ms, |txn| {
            meta::set(txn, META_DISMISSED, &now_ms.to_string())
        })
        .map_err(|error| {
            eprintln!("review: could not set the buffer suggestion aside ({error})");
            ReviewError::Store
        })
}
