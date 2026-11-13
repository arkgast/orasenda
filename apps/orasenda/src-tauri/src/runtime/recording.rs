//! Shortcut recording (spec: H3, `keyboard_recording`). While a recorder in Settings listens, every
//! menu accelerator (the standard items, ⌘, and ⌘K included), every global shortcut and the single keys must stay
//! quiet, so any chord reaches the recorder. The webview says `on` when a recorder starts and `off`
//! when it ends; Rust also restores when `main` loses focus, closes or reloads. The state is one
//! boolean in memory: `on` twice then `off` once restores, and a relaunch starts unsuspended.
//! The single keys live in the webview, whose recorder already takes every key it hears.

use std::sync::{Arc, Mutex, PoisonError};

use tauri::menu::Menu;
use tauri::{AppHandle, Manager, Wry};

use crate::lifecycle::MAIN;
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

/// The suspension: one boolean, held across the work so two calls never interleave.
pub struct Recording<H: Suspender> {
    host: H,
    on: Mutex<bool>,
}

impl<H: Suspender> Recording<H> {
    pub fn new(host: H) -> Recording<H> {
        Recording {
            host,
            on: Mutex::new(false),
        }
    }

    /// `keyboard_recording(on)`. A repeated `on` or `off` does nothing.
    pub fn set(&self, on: bool) {
        let mut state = self.on.lock().unwrap_or_else(PoisonError::into_inner);
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

    /// Restores when `main` is left by any route Rust sees.
    pub fn left(&self, _how: Leave) {
        self.set(false);
    }

    /// Like [`Recording::left`], but on its own thread. The main thread must never wait on the lock:
    /// a suspend or restore in flight waits for the main thread (the plugin hops to it), so waiting
    /// here would deadlock.
    pub fn left_detached(self: &Arc<Self>, how: Leave)
    where
        H: Send + Sync + 'static,
    {
        let recording = Arc::clone(self);
        std::thread::spawn(move || recording.left(how));
    }

    #[cfg(test)]
    pub fn is_on(&self) -> bool {
        *self.on.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// The global-shortcut half of the suspension: every held shortcut is unregistered, then registered again.
pub struct Globals<B: Backend> {
    backend: B,
    held: Arc<Held>,
}

impl<B: Backend> Globals<B> {
    pub fn new(backend: B, held: Arc<Held>) -> Globals<B> {
        Globals { backend, held }
    }

    pub fn suspend(&self) {
        for shortcut in self.held.shortcuts() {
            if let Err(error) = self.backend.unregister(shortcut) {
                eprintln!("recording: could not suspend a shortcut: {error}");
            }
        }
    }

    pub fn restore(&self) {
        for shortcut in self.held.shortcuts() {
            if let Err(error) = self.backend.register(shortcut) {
                eprintln!("recording: could not restore a shortcut: {error}");
            }
        }
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
        self.globals.restore();
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
