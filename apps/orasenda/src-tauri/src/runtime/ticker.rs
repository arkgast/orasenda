//! The scheduler in the app: the `session-scheduler` thread and the Tauri side of the
//! service's [`Host`]. Every publish step lives in `orasenda-service`; it is re-exported here.

use std::io;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::SystemTime;

use orasenda_core::Notifier;
use orasenda_core::clock::delay_to_next_second;
use orasenda_service::api::{
    KeyboardView, MilestoneEvent, NoteView, PresetEntry, Settings, Theme, TimerView,
};
use orasenda_service::session::{SessionService, Surfaces, ViewGate};
use tauri::{AppHandle, Manager};

pub use orasenda_service::scheduler::*;

use crate::ipc::ClockTick;

/// The running app as the service's [`Host`]. A newtype: the trait lives in
/// `orasenda-service`, `AppHandle` in Tauri, so the app can't implement one for the other.
#[derive(Clone)]
pub struct AppHost(AppHandle);

impl AppHost {
    pub fn new(app: &AppHandle) -> AppHost {
        AppHost(app.clone())
    }
}

impl Host for AppHost {
    fn service(&self) -> Option<&Mutex<SessionService>> {
        self.0
            .try_state::<Mutex<SessionService>>()
            .map(|state| state.inner())
    }

    fn surfaces(&self) -> Option<&Surfaces> {
        self.0.try_state::<Surfaces>().map(|state| state.inner())
    }

    fn view_gate(&self) -> Option<&ViewGate> {
        self.0.try_state::<ViewGate>().map(|state| state.inner())
    }

    fn notifier(&self) -> Arc<dyn Notifier> {
        match self.0.try_state::<Arc<dyn Notifier>>() {
            Some(notifier) => Arc::clone(notifier.inner()),
            None => Arc::new(orasenda_core::NoopNotifier),
        }
    }

    fn now_ms(&self) -> u64 {
        super::session::now_ms()
    }

    /// Cached from the activation notifications (`observe_activation`, at tray setup), so
    /// any thread may read it. Always false off macOS, where nothing is observed.
    fn app_active(&self) -> bool {
        #[cfg(target_os = "macos")]
        {
            orasenda_platform_macos::app_active()
        }
        #[cfg(not(target_os = "macos"))]
        {
            false
        }
    }

    fn emit_timer_tick(&self, view: &TimerView) {
        super::events::emit_timer_tick(&self.0, view);
    }

    fn emit_milestone(&self, event: &MilestoneEvent) {
        super::events::emit_milestone(&self.0, event);
    }

    fn emit_clock_tick(&self, tick: &ClockTick) {
        super::events::emit_clock_tick(&self.0, tick);
    }

    fn emit_settings_changed(&self, settings: &Settings) {
        super::events::emit_settings_changed(&self.0, settings);
    }

    fn emit_presets_changed(&self, presets: &[PresetEntry]) {
        super::events::emit_presets_changed(&self.0, presets);
    }

    fn emit_keyboard_changed(&self, view: &KeyboardView) {
        super::events::emit_keyboard_changed(&self.0, view);
    }

    fn emit_inbox_changed(&self, notes: &[NoteView]) {
        super::events::emit_inbox_changed(&self.0, notes);
    }

    fn apply_theme(&self, theme: Theme) {
        self.0.set_theme(super::events::tauri_theme(theme));
    }
}

/// One `clock-tick` and, while a session is running or paused, one `timer-tick` and a render
/// (T7), on the app.
pub fn publish_focus(app: &AppHandle) {
    orasenda_service::scheduler::publish_focus(&AppHost::new(app));
}

/// Starts the `session-scheduler` thread. It re-reads the wall clock on every iteration, so
/// sleep, clock jumps and NTP corrections realign on the next tick. Fails only when the OS
/// cannot start the thread.
pub fn spawn<H: Host>(host: H) -> io::Result<()> {
    thread::Builder::new()
        .name("session-scheduler".into())
        .spawn(move || {
            loop {
                thread::sleep(delay_to_next_second(SystemTime::now()));
                iterate(&host);
            }
        })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use orasenda_core::NotificationStatus;
    use orasenda_service::session::run_set_settings;
    use orasenda_service::session::test_support::{Event, TestHost};

    use super::super::events::tauri_theme;
    use super::*;

    #[test]
    fn system_theme_clears_override() {
        let host = TestHost::fresh(NotificationStatus::Granted);
        for theme in [Theme::Dark, Theme::System] {
            run_set_settings(
                &host,
                Settings {
                    theme,
                    ..Settings::default()
                },
            )
            .expect("saves");
        }
        let applied: Vec<_> = host
            .log()
            .take()
            .into_iter()
            .filter(|e| matches!(e, Event::ApplyTheme(_)))
            .collect();
        assert_eq!(
            applied,
            [
                Event::ApplyTheme(Theme::Dark),
                Event::ApplyTheme(Theme::System)
            ]
        );
        assert_eq!(tauri_theme(Theme::System), None);
        assert_eq!(tauri_theme(Theme::Light), Some(tauri::Theme::Light));
        assert_eq!(tauri_theme(Theme::Dark), Some(tauri::Theme::Dark));
    }
}
