//! The emits and the theme mapping on the app.

use orasenda_service::api::{MilestoneEvent, Settings, Theme, TimerView};
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use crate::ipc::{ClockTick, ClockTickEvent, SettingsChanged, TimerMilestoneEvent, TimerTickEvent};
use crate::runtime::session::Surfaces;

/// The Tauri theme for a saved one: `System` clears the override.
pub(crate) fn tauri_theme(theme: Theme) -> Option<tauri::Theme> {
    match theme {
        Theme::System => None,
        Theme::Light => Some(tauri::Theme::Light),
        Theme::Dark => Some(tauri::Theme::Dark),
    }
}

pub(super) fn emit_timer_tick(app: &AppHandle, view: &TimerView) {
    if let Err(error) = TimerTickEvent(view.clone()).emit(app) {
        eprintln!("session-scheduler: could not emit timer-tick: {error}");
    }
}

pub(super) fn emit_milestone(app: &AppHandle, event: &MilestoneEvent) {
    if let Err(error) = TimerMilestoneEvent(event.clone()).emit(app) {
        eprintln!("session-scheduler: could not emit timer-milestone: {error}");
    }
}

pub(super) fn emit_clock_tick(app: &AppHandle, tick: &ClockTick) {
    if let Err(error) = ClockTickEvent(tick.clone()).emit(app) {
        eprintln!("session-scheduler: could not emit clock-tick: {error}");
    }
}

pub(super) fn emit_settings_changed(app: &AppHandle, settings: &Settings) {
    if let Err(error) = SettingsChanged(settings.clone()).emit(app) {
        eprintln!("session-scheduler: could not emit settings-changed: {error}");
    }
    // The surfaces list is copied under its lock and told after it is released, as `publish`
    // does for a view.
    if let Some(surfaces) = app.try_state::<Surfaces>() {
        let list = surfaces
            .0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .clone();
        for surface in list {
            surface.settings_changed(settings);
        }
    }
}
