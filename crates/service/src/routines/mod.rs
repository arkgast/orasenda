//! Routines and habits in the service (spec 2026-11-14, §Service and IPC): the routines, their
//! habits, check-ins and templates, and the `routines-changed` event.
//!
//! Like the Inbox, each `run_*` locks the [`SessionService`](crate::session::SessionService)
//! for the store write and its read-back, then emits `routines-changed` after the lock is
//! released. A store that can't be read is an error, never an empty list.

mod service;
#[cfg(test)]
mod tests;
mod view;
pub mod words;

pub use service::{MAX_LONG, MAX_ROUTINE_HABITS, MAX_ROUTINES, MAX_SHORT, MAX_STANDALONE_HABITS};
pub use view::WINDOW_DAYS;

use orasenda_core::TemplateId;
use orasenda_core::routines::templates;
use orasenda_store::Txn;
use orasenda_store::routines::{self as routine_rows, habits};

use crate::api::{HabitDraft, RoutineDraft, RoutinesError, RoutinesView, TemplateView};
use crate::scheduler::Host;
use crate::session::lock;
use service::{Answer, found};
use view::Local;

/// `routines_list`: the routines, the standalone habits and the open run.
pub fn run_routines_list<H: Host>(host: &H) -> Result<RoutinesView, RoutinesError> {
    let service = host.service().ok_or(RoutinesError::Store)?;
    lock(service).routines_view(host.now_ms()).map_err(|error| {
        eprintln!("routines: could not list the routines ({error})");
        RoutinesError::Store
    })
}

/// `routine_templates`: the five starter templates, their times worded by the hour cycle.
pub fn run_routine_templates<H: Host>(host: &H) -> Result<Vec<TemplateView>, RoutinesError> {
    let service = host.service().ok_or(RoutinesError::Store)?;
    let cycle = lock(service).routines_local(host.now_ms()).cycle;
    Ok(templates::all()
        .iter()
        .map(|template| TemplateView {
            id: template.id,
            name: template.name.to_owned(),
            summary: template.summary.to_owned(),
            time: template
                .time_of_day
                .map(|minute| words::time_label(minute, cycle)),
            steps: template.steps.iter().map(words::template_step).collect(),
            note: template.note.to_owned(),
        })
        .collect())
}

/// `routine_create`: saves a new routine; answers its id.
pub fn run_routine_create<H: Host>(
    host: &H,
    draft: &RoutineDraft,
) -> Result<String, RoutinesError> {
    let fields = service::checked_routine(draft)?;
    write(host, |txn, _| service::create_routine(txn, fields, None))
}

/// `routine_add_template`: copies a template into a new, editable routine; answers its id.
pub fn run_routine_add_template<H: Host>(
    host: &H,
    template: TemplateId,
) -> Result<String, RoutinesError> {
    write(host, |txn, _| service::add_template(txn, template))
}

/// `routine_update`: saves a live routine's name, time and days.
pub fn run_routine_update<H: Host>(
    host: &H,
    id: &str,
    draft: &RoutineDraft,
) -> Result<(), RoutinesError> {
    let fields = service::checked_routine(draft)?;
    write(host, |txn, _| {
        found(routine_rows::update(txn, id, &fields)?)
    })
}

/// `routine_move`: moves a live routine to `to_index` (past the end means last).
pub fn run_routine_move<H: Host>(host: &H, id: &str, to_index: u32) -> Result<(), RoutinesError> {
    write(host, |txn, _| {
        found(routine_rows::move_to(txn, id, index(to_index))?)
    })
}

/// `routine_remove`: tombstones a routine and its habits.
pub fn run_routine_remove<H: Host>(host: &H, id: &str) -> Result<(), RoutinesError> {
    write(host, |txn, _| found(routine_rows::remove(txn, id)?))
}

/// `routine_restore`: brings a removed routine back with the habits its removal took.
pub fn run_routine_restore<H: Host>(host: &H, id: &str) -> Result<(), RoutinesError> {
    write(host, |txn, _| service::restore_routine(txn, id))
}

/// `habit_create`: saves a new habit in a live routine, or standalone for `None`; answers its
/// id.
pub fn run_habit_create<H: Host>(
    host: &H,
    routine_id: Option<&str>,
    draft: &HabitDraft,
) -> Result<String, RoutinesError> {
    write(host, |txn, _| service::create_habit(txn, routine_id, draft))
}

/// `habit_update`: saves a live habit's fields.
pub fn run_habit_update<H: Host>(
    host: &H,
    id: &str,
    draft: &HabitDraft,
) -> Result<(), RoutinesError> {
    write(host, |txn, _| service::update_habit(txn, id, draft))
}

/// `habit_move`: moves a live habit within its own list.
pub fn run_habit_move<H: Host>(host: &H, id: &str, to_index: u32) -> Result<(), RoutinesError> {
    write(host, |txn, _| {
        found(habits::move_to(txn, id, index(to_index))?)
    })
}

/// `habit_remove`: tombstones a habit.
pub fn run_habit_remove<H: Host>(host: &H, id: &str) -> Result<(), RoutinesError> {
    write(host, |txn, _| found(habits::remove(txn, id)?))
}

/// `habit_restore`: brings a removed habit back when its routine is live and has room.
pub fn run_habit_restore<H: Host>(host: &H, id: &str) -> Result<(), RoutinesError> {
    write(host, |txn, _| service::restore_habit(txn, id))
}

/// `habit_check`: checks a habit in for today's local date (`done`), or removes today's
/// check-in.
pub fn run_habit_check<H: Host>(host: &H, id: &str, done: bool) -> Result<(), RoutinesError> {
    write(host, |txn, local| {
        service::check_habit(txn, id, done, local.today)
    })
}

/// The routines view for an event outside a command (local midnight, an import), read under
/// the lock the caller holds. A failed read is logged and gives `None`.
pub(crate) fn changed_view(
    service: &crate::session::SessionService,
    now_ms: u64,
) -> Option<RoutinesView> {
    service
        .routines_view(now_ms)
        .map_err(|error| eprintln!("routines: could not read the routines ({error})"))
        .ok()
}

/// Locks the service, runs `op` in one write and reads the view back, then emits
/// `routines-changed` after the lock is released.
///
/// When the write commits but the read-back fails, the command still answers `Ok` and no
/// `routines-changed` follows (only a log line records it). The webview (R7) must re-list
/// with `routines_list` after an `Ok` that brought no event, or its view can stay stale.
fn write<H: Host, T>(
    host: &H,
    op: impl FnOnce(&mut Txn, Local) -> Answer<T>,
) -> Result<T, RoutinesError> {
    let service = host.service().ok_or(RoutinesError::Store)?;
    let (value, view) = lock(service).routines_write(host.now_ms(), op)?;
    if let Some(view) = view {
        host.emit_routines_changed(&view);
    }
    Ok(value)
}

fn index(to_index: u32) -> usize {
    usize::try_from(to_index).unwrap_or(usize::MAX)
}
