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
    // Read at emit time, so two overlapping saves leave the newest saved settings on the
    // surfaces whatever order their events run in.
    resync_surfaces(app, &crate::runtime::session::current_settings(app));
}

/// Tells every surface `settings`. Also the tray's resync after a failed preset save, whose
/// check mark the menu already toggled.
pub(crate) fn resync_surfaces(app: &AppHandle, settings: &Settings) {
    if let Some(surfaces) = app.try_state::<Surfaces>() {
        notify_settings(&surfaces, settings);
    }
}

/// The surfaces list is copied under its lock and told after it is released, as `publish`
/// does for a view.
fn notify_settings(surfaces: &Surfaces, settings: &Settings) {
    let list = surfaces
        .0
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .clone();
    for surface in list {
        surface.settings_changed(settings);
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use orasenda_service::session::NativeSurface;

    use super::*;

    struct Probe {
        surfaces: Arc<Surfaces>,
        seen: Mutex<Vec<(bool, Settings)>>,
    }

    impl NativeSurface for Probe {
        fn render(&self, _view: &TimerView) {}
        fn settings_changed(&self, settings: &Settings) {
            let free = self.surfaces.0.try_lock().is_ok();
            self.seen.lock().unwrap().push((free, settings.clone()));
        }
    }

    #[test]
    fn notify_settings_reaches_surfaces_with_the_lock_released() {
        let surfaces = Arc::new(Surfaces::default());
        let probe = Arc::new(Probe {
            surfaces: Arc::clone(&surfaces),
            seen: Mutex::new(Vec::new()),
        });
        surfaces.0.lock().unwrap().push(probe.clone());
        let settings = Settings {
            preset: orasenda_core::Preset::DeepBlock,
            ..Settings::default()
        };
        notify_settings(&surfaces, &settings);
        let seen = probe.seen.lock().unwrap();
        assert_eq!(seen.len(), 1);
        assert!(seen[0].0, "the surfaces lock is released before the call");
        assert_eq!(seen[0].1, settings);
    }
}
