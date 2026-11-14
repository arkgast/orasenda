//! The Focus view commands: the displays, closing the floater, opening Orasenda from it,
//! the timer view the Focus surfaces read, and the next-preset choice.
//!
//! Every window call runs on a `spawn_blocking` thread (creating a window waits on the main
//! thread). None of them touches the session service apart from the frame store.

use orasenda_core::NotificationStatus;

use super::on_blocking;
use crate::ipc::{
    DisplayInfo, FocusViewError, StoreStatus, TimerCommandError, TimerCommandErrorKind, TimerView,
};
use crate::lifecycle::MAIN;
use crate::runtime::session;
use crate::windows::{self, AppOps, Ops};

fn task_failed() -> FocusViewError {
    FocusViewError::unavailable("Orasenda couldn't finish that. Try again.")
}

/// The connected displays: the main window's first (flagged), then the rest in screen order. `[]` off macOS or when
/// they can't be read (logged).
pub(crate) fn display_infos<O: Ops>(ops: &O) -> Vec<DisplayInfo> {
    let screens = match ops.screens() {
        Ok(screens) => screens,
        Err(error) => {
            eprintln!("displays_list: {}", error.message);
            return Vec::new();
        }
    };
    let main = ops
        .main_display()
        .filter(|id| screens.iter().any(|screen| &screen.id == id))
        .or_else(|| screens.first().map(|screen| screen.id.clone()));
    let (first, rest): (Vec<_>, Vec<_>) = screens
        .into_iter()
        .map(|screen| DisplayInfo {
            has_main_window: main.as_deref() == Some(screen.id.as_str()),
            id: screen.id,
            name: screen.name,
        })
        .partition(|info| info.has_main_window);
    first.into_iter().chain(rest).collect()
}

/// The connected displays.
#[tauri::command]
#[specta::specta]
pub async fn displays_list(app: tauri::AppHandle) -> Vec<DisplayInfo> {
    on_blocking(move || display_infos(&AppOps::new(&app)))
        .await
        .unwrap_or_default()
}

/// Whether the calling window may close itself as a Focus view: every window but `main`.
pub(crate) fn closable(label: &str) -> Result<(), FocusViewError> {
    if label == MAIN {
        Err(FocusViewError::unavailable(
            "The main window isn't a focus view.",
        ))
    } else {
        Ok(())
    }
}

/// Closes the calling floater; refused for `main`.
#[tauri::command]
#[specta::specta]
pub async fn focus_view_close(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<(), FocusViewError> {
    let label = window.label().to_owned();
    closable(&label)?;
    on_blocking(move || {
        let ops = AppOps::new(&app);
        if !ops.exists(&label) {
            return Err(FocusViewError::unavailable(
                "There is no focus view to close here.",
            ));
        }
        ops.close(&label);
        Ok(())
    })
    .await
    .unwrap_or_else(|| Err(task_failed()))
}

/// Open Orasenda: shows `main`, then closes the floater.
#[tauri::command]
#[specta::specta]
pub async fn main_show(app: tauri::AppHandle) -> Result<(), FocusViewError> {
    #[cfg(desktop)]
    {
        let shown = app.clone();
        app.run_on_main_thread(move || crate::lifecycle::show_main(&shown))
            .map_err(|error| {
                eprintln!("main_show: {error}");
                task_failed()
            })?;
        on_blocking(move || windows::close_floater(&app))
            .await
            .ok_or_else(task_failed)
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        Err(FocusViewError::unavailable("Focus views need a desktop."))
    }
}

/// The current timer view, without taking the milestones `timer_state` hands to Today.
#[tauri::command]
#[specta::specta]
pub async fn timer_view(app: tauri::AppHandle) -> TimerView {
    on_blocking(move || session::run_view(&app))
        .await
        .unwrap_or_else(|| {
            TimerView::idle(StoreStatus::Unavailable, NotificationStatus::Unavailable)
        })
}

/// Saves a library preset as the next session's, while idle.
#[tauri::command]
#[specta::specta]
pub async fn preset_select(
    app: tauri::AppHandle,
    preset_id: String,
) -> Result<(), TimerCommandError> {
    on_blocking(move || session::run_select_preset(&app, preset_id))
        .await
        .unwrap_or_else(|| {
            Err(TimerCommandError {
                kind: TimerCommandErrorKind::Store,
                message: "Orasenda couldn't finish that. Try again.".into(),
            })
        })
}
