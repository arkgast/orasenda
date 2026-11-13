//! Shortcut recording (spec: H3, `keyboard_recording`). While a recorder in Settings listens, every
//! menu accelerator (the standard items, ⌘, and ⌘K included), every global shortcut and the single keys must stay
//! quiet, so any chord reaches the recorder. The webview says `on` when a recorder starts and `off`
//! when it ends; Rust also restores when `main` loses focus, closes or reloads. The state is one
//! boolean in memory: `on` twice then `off` once restores, and a relaunch starts unsuspended.
//! The single keys live in the webview, whose recorder already takes every key it hears.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use orasenda_service::keyboard::{ActionId, KeyboardService};

use tauri::menu::Menu;
use tauri::{AppHandle, Manager, Wry};

use crate::lifecycle::MAIN;
use crate::runtime::ticker::AppHost;
use crate::shortcuts::{AppBackend, Backend, Held};

/// What suspending and restoring does to the app. Real on desktop ([`AppSuspender`]), a fake in tests.
pub trait Suspender {
    fn suspend(&self);
    fn restore(&self);
}

/// Why Rust restores by itself.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Leave {
    /// `main` lost focus.
    Blur,
    /// `main` is closing (or being hidden).
    Close,
    /// The `main` webview started loading a page.
    Reload,
}

/// The suspension: one boolean, held across the work so two calls never interleave. `turn` counts
/// every `set`, so a restore queued by `left_detached` is dropped when a newer `set` came after it.
pub struct Recording<H: Suspender> {
    host: H,
    on: Mutex<bool>,
    turn: AtomicU64,
}

impl<H: Suspender> Recording<H> {
    pub fn new(host: H) -> Recording<H> {
        Recording {
            host,
            on: Mutex::new(false),
            turn: AtomicU64::new(0),
        }
    }

    /// `keyboard_recording(on)`. A repeated `on` or `off` does nothing.
    pub fn set(&self, on: bool) {
        self.turn.fetch_add(1, Ordering::SeqCst);
        self.set_in_turn(on, None);
    }

    /// Applies `on`. With `only_turn`, does nothing when a `set` has come since that turn: the
    /// check runs under the lock, so a restore never undoes a newer recording.
    fn set_in_turn(&self, on: bool, only_turn: Option<u64>) {
        let mut state = self.on.lock().unwrap_or_else(PoisonError::into_inner);
        if only_turn.is_some_and(|turn| turn != self.turn.load(Ordering::SeqCst)) {
            return;
        }
        if *state == on {
            return;
        }
        if on {
            self.host.suspend();
        } else {
            self.host.restore();
        }
        *state = on;
    }

    /// Restores when `main` is left by any route Rust sees (the tests; the app queues it).
    #[cfg(test)]
    pub fn left(&self, _how: Leave) {
        self.set_in_turn(false, None);
    }

    /// Like [`Recording::left`], but on a blocking task. The main thread must never wait on the
    /// lock: a suspend or restore in flight waits for the main thread (the plugin hops to it), so
    /// waiting here would deadlock. A `set` that arrives after this call wins over the restore.
    pub fn left_detached(self: &Arc<Self>, _how: Leave)
    where
        H: Send + Sync + 'static,
    {
        let turn = self.turn.load(Ordering::SeqCst);
        let recording = Arc::clone(self);
        tauri::async_runtime::spawn_blocking(move || recording.set_in_turn(false, Some(turn)));
    }

    #[cfg(test)]
    pub fn turn_for_test(&self) -> u64 {
        self.turn.load(Ordering::SeqCst)
    }

    #[cfg(test)]
    pub fn restore_if_turn_for_test(&self, turn: u64) {
        self.set_in_turn(false, Some(turn));
    }

    #[cfg(test)]
    pub fn is_on(&self) -> bool {
        *self.on.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// The global-shortcut half of the suspension: every live shortcut is let go, then taken again.
pub struct Globals<B: Backend> {
    backend: B,
    held: Arc<Held>,
}

impl<B: Backend> Globals<B> {
    pub fn new(backend: B, held: Arc<Held>) -> Globals<B> {
        Globals { backend, held }
    }

    pub fn suspend(&self) {
        for shortcut in self.held.begin_suspension() {
            if let Err(error) = self.backend.unregister(shortcut) {
                eprintln!("recording: could not suspend a shortcut: {error}");
            }
        }
    }

    /// Takes the shortcuts again. Returns the actions whose shortcut the OS no longer lets us
    /// have (another app took it meanwhile); they are dropped from the held table.
    pub fn restore(&self) -> Vec<ActionId> {
        let mut failed = Vec::new();
        for entry in self.held.end_suspension() {
            let result = self.backend.register(entry.shortcut);
            if let Err(error) = &result {
                eprintln!("recording: could not restore a shortcut: {error}");
                failed.push(entry.id);
            }
            self.held.settle(entry, result.is_ok());
        }
        failed
    }
}

/// The real suspension: the app menu is taken off the app (its accelerators go with it) and the
/// held global shortcuts are unregistered. Both are put back by `restore`.
pub struct AppSuspender {
    app: AppHandle,
    globals: Globals<AppBackend>,
    menu: Mutex<Option<Menu<Wry>>>,
}

impl AppSuspender {
    pub fn new(app: &AppHandle, held: Arc<Held>) -> AppSuspender {
        AppSuspender {
            app: app.clone(),
            globals: Globals::new(AppBackend(app.clone()), held),
            menu: Mutex::new(None),
        }
    }
}

impl Suspender for AppSuspender {
    fn suspend(&self) {
        match self.app.remove_menu() {
            Ok(menu) => *self.menu.lock().unwrap_or_else(PoisonError::into_inner) = menu,
            Err(error) => eprintln!("recording: could not take the menu off: {error}"),
        }
        self.globals.suspend();
    }

    fn restore(&self) {
        let menu = self
            .menu
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take();
        if let Some(menu) = menu
            && let Err(error) = self.app.set_menu(menu)
        {
            eprintln!("recording: could not put the menu back: {error}");
        }
        // The menu came back with the accelerators it had when it was taken off.
        #[cfg(target_os = "macos")]
        if let Some(keyboard) = self.app.try_state::<KeyboardService>() {
            crate::menu::apply_accelerators(&self.app, &keyboard.view(&AppHost::new(&self.app)));
        }
        let failed = self.globals.restore();
        if !failed.is_empty()
            && let Some(keyboard) = self.app.try_state::<KeyboardService>()
        {
            // Settings shows these as not available, and the tray drops their keys.
            keyboard.mark_failed(&AppHost::new(&self.app), &failed);
        }
    }
}

/// Manages the suspension. Called in setup, after the shortcuts table is managed.
pub fn manage(app: &tauri::App) {
    let held = Arc::clone(&app.state::<Arc<Held>>());
    app.manage(Arc::new(Recording::new(AppSuspender::new(
        app.handle(),
        held,
    ))));
}

/// `keyboard_recording` on the app.
pub fn set(app: &AppHandle, on: bool) {
    match app.try_state::<Arc<Recording<AppSuspender>>>() {
        Some(recording) => recording.set(on),
        None => eprintln!("recording: not set up yet"),
    }
}

/// Restores when `main` is left (blur, close or reload).
pub fn left(app: &AppHandle, how: Leave) {
    if let Some(recording) = app.try_state::<Arc<Recording<AppSuspender>>>() {
        recording.left_detached(how);
    }
}

/// The window events that end a recording: `main` loses focus, asks to close or is destroyed.
pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if window.label() != MAIN {
        return;
    }
    let how = match event {
        tauri::WindowEvent::Focused(false) => Leave::Blur,
        tauri::WindowEvent::CloseRequested { .. } | tauri::WindowEvent::Destroyed => Leave::Close,
        _ => return,
    };
    left(window.app_handle(), how);
}

/// A page load on `main` leaves any recorder behind, so shortcuts come back with the new page.
pub fn on_page_load(webview: &tauri::Webview, payload: &tauri::webview::PageLoadPayload<'_>) {
    if webview.label() == MAIN && payload.event() == tauri::webview::PageLoadEvent::Started {
        left(webview.app_handle(), Leave::Reload);
    }
}
