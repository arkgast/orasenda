//! The Routines page's commands (spec 2026-11-14, §Service and IPC): routines, habits,
//! check-ins, templates and runs. `main`-window only. Each one runs the service on the blocking
//! pool; a panicked task answers `Store`.

use orasenda_service::routines;

use super::on_blocking;
use crate::ipc::{
    HabitDraft, RoutineDraft, RoutinesError, RoutinesView, RunView, StepOutcome, TemplateId,
    TemplateView,
};
use crate::runtime::ticker::AppHost;

/// Runs `work` with the app's host on the blocking pool.
async fn run<T: Send + 'static>(
    app: tauri::AppHandle,
    work: impl FnOnce(&AppHost) -> Result<T, RoutinesError> + Send + 'static,
) -> Result<T, RoutinesError> {
    on_blocking(move || work(&AppHost::new(&app)))
        .await
        .unwrap_or(Err(RoutinesError::Store))
}

/// The routines, the standalone habits and the open run.
#[tauri::command]
#[specta::specta]
pub async fn routines_list(app: tauri::AppHandle) -> Result<RoutinesView, RoutinesError> {
    run(app, routines::run_routines_list).await
}

/// The five starter templates.
#[tauri::command]
#[specta::specta]
pub async fn routine_templates(app: tauri::AppHandle) -> Result<Vec<TemplateView>, RoutinesError> {
    run(app, routines::run_routine_templates).await
}

/// Saves a new routine; answers its id.
#[tauri::command]
#[specta::specta]
pub async fn routine_create(
    app: tauri::AppHandle,
    draft: RoutineDraft,
) -> Result<String, RoutinesError> {
    run(app, move |host| routines::run_routine_create(host, &draft)).await
}

/// Copies a template into a new, editable routine; answers its id.
#[tauri::command]
#[specta::specta]
pub async fn routine_add_template(
    app: tauri::AppHandle,
    template: TemplateId,
) -> Result<String, RoutinesError> {
    run(app, move |host| {
        routines::run_routine_add_template(host, template)
    })
    .await
}

/// Saves a routine's name, time and days.
#[tauri::command]
#[specta::specta]
pub async fn routine_update(
    app: tauri::AppHandle,
    id: String,
    draft: RoutineDraft,
) -> Result<(), RoutinesError> {
    run(app, move |host| {
        routines::run_routine_update(host, &id, &draft)
    })
    .await
}

/// Moves a routine to `toIndex` (past the end means last).
#[tauri::command]
#[specta::specta]
pub async fn routine_move(
    app: tauri::AppHandle,
    id: String,
    to_index: u32,
) -> Result<(), RoutinesError> {
    run(app, move |host| {
        routines::run_routine_move(host, &id, to_index)
    })
    .await
}

/// Removes a routine and its habits (they can be brought back).
#[tauri::command]
#[specta::specta]
pub async fn routine_remove(app: tauri::AppHandle, id: String) -> Result<(), RoutinesError> {
    run(app, move |host| routines::run_routine_remove(host, &id)).await
}

/// Brings a removed routine back with its habits.
#[tauri::command]
#[specta::specta]
pub async fn routine_restore(app: tauri::AppHandle, id: String) -> Result<(), RoutinesError> {
    run(app, move |host| routines::run_routine_restore(host, &id)).await
}

/// Saves a new habit in a routine, or standalone for `null`; answers its id.
#[tauri::command]
#[specta::specta]
pub async fn habit_create(
    app: tauri::AppHandle,
    routine_id: Option<String>,
    draft: HabitDraft,
) -> Result<String, RoutinesError> {
    run(app, move |host| {
        routines::run_habit_create(host, routine_id.as_deref(), &draft)
    })
    .await
}

/// Saves a habit's fields.
#[tauri::command]
#[specta::specta]
pub async fn habit_update(
    app: tauri::AppHandle,
    id: String,
    draft: HabitDraft,
) -> Result<(), RoutinesError> {
    run(app, move |host| {
        routines::run_habit_update(host, &id, &draft)
    })
    .await
}

/// Moves a habit within its own list.
#[tauri::command]
#[specta::specta]
pub async fn habit_move(
    app: tauri::AppHandle,
    id: String,
    to_index: u32,
) -> Result<(), RoutinesError> {
    run(app, move |host| {
        routines::run_habit_move(host, &id, to_index)
    })
    .await
}

/// Removes a habit (it can be brought back).
#[tauri::command]
#[specta::specta]
pub async fn habit_remove(app: tauri::AppHandle, id: String) -> Result<(), RoutinesError> {
    run(app, move |host| routines::run_habit_remove(host, &id)).await
}

/// Brings a removed habit back.
#[tauri::command]
#[specta::specta]
pub async fn habit_restore(app: tauri::AppHandle, id: String) -> Result<(), RoutinesError> {
    run(app, move |host| routines::run_habit_restore(host, &id)).await
}

/// Checks a habit in for today (`done`), or removes today's check-in.
#[tauri::command]
#[specta::specta]
pub async fn habit_check(
    app: tauri::AppHandle,
    id: String,
    done: bool,
) -> Result<(), RoutinesError> {
    run(app, move |host| routines::run_habit_check(host, &id, done)).await
}

/// Starts a run of a routine, its steps frozen in their current order.
#[tauri::command]
#[specta::specta]
pub async fn run_start(
    app: tauri::AppHandle,
    routine_id: String,
) -> Result<RunView, RoutinesError> {
    run(app, move |host| routines::run_run_start(host, &routine_id)).await
}

/// Answers the open run's current step: `done` checks its habit in, `skip` only counts.
#[tauri::command]
#[specta::specta]
pub async fn run_step(
    app: tauri::AppHandle,
    run_id: String,
    outcome: StepOutcome,
) -> Result<RunView, RoutinesError> {
    run(app, move |host| {
        routines::run_run_step(host, &run_id, outcome)
    })
    .await
}

/// Ends the open run early, as stopped.
#[tauri::command]
#[specta::specta]
pub async fn run_end(app: tauri::AppHandle, run_id: String) -> Result<RunView, RoutinesError> {
    run(app, move |host| routines::run_run_end(host, &run_id)).await
}
