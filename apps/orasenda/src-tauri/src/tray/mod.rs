//! The macOS menu-bar item (spec: Menu bar; design system `MenuBarTimer`, "Menu-bar glyphs").
//!
//! The glyphs in `tray/icons/` are template images (black with alpha only) drawn from the
//! design system's mode shapes (`viewBox 0 0 10 10`): `focus` the filled circle (r 5), `paused`
//! the two bars (`M1 1h3v8H1zM6 1h3v8H6z`), `idle` the hollow circle (r 4, stroke 1.5, so about
//! 4.2 px in the asset). Each is one 36×36 px image: an 18×18 pt canvas at 2x, the shape filling
//! the centre 28×28 px (2.8 px per unit, a 4 px margin). `tray-icon` sizes the image to 18 pt
//! high. The title is `remaining` in the system font, or none when idle.
//!
//! The design system's spoken name ("Focus, 24 minutes 59 seconds remaining", "No session")
//! is the status item's accessibility label on macOS, which VoiceOver reads (#107), and the
//! tooltip; both change with the title.
//!
//! Threading (plan, Impact "Threading"): every tray, menu and window call runs on the main
//! thread with no lock held. [`Tray::render`] only records the wanted state under `Tray`'s own
//! small mutex and posts one non-blocking task to the main thread; that task takes the wanted
//! state and the drawn state under the same mutex, releases it, then calls `set_title`,
//! `set_icon` and `set_menu` for what changed. Because every draw runs on the main thread, one
//! after another, the drawn state always matches the menu bar, and a tick costs one
//! `set_title`, one `set_tooltip` and one `set_accessibility_label`. A failed call is logged
//! and the draw is posted again after [`RETRY_DELAY`](state::RETRY_DELAY) from a background thread (Tauri runs a
//! post inline when already on the main thread, so an immediate retry would run back to back),
//! at most [`DRAW_RETRIES`](state::DRAW_RETRIES) times for one view; a newer render drops an older pending retry.
//! Which view is newest is decided before `render` by `scheduler::publish_view`. Menu actions
//! run `run_action` on a `spawn_blocking` thread. The Developer panel item opens its window from
//! a `spawn_blocking` thread too, because creating a window waits on the main thread.

mod menu;
mod render;
mod state;
#[cfg(test)]
mod tests;

use std::sync::{Arc, Mutex, PoisonError};
use std::thread;

use tauri::menu::MenuItem;
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Manager, Wry};

use crate::ipc::TimerView;
use crate::runtime::session::{NativeSurface, Surfaces};

#[cfg(test)]
pub(crate) use menu::{
    EDIT_TIMES, END_SESSION, JUST_TWO, MenuCommand, PAUSE, QUIT, RESUME, SETTINGS, SHOW, START,
    menu_command, settings_target, start_action,
};
#[cfg(test)]
pub(crate) use render::header_text;
pub(crate) use render::{Glyph, Tray, TrayHandle, tray_label, tray_title_and_icon};

use menu::{MenuEntry, NextSession, build_menu, menu_items, on_menu_event};
use render::report;
use state::{RETRY_DELAY, lock_state};

/// The tray icon's id.
pub(crate) const TRAY_ID: &str = "orasenda";

/// The real tray handle.
struct TauriTray {
    app: AppHandle,
    icon: TrayIcon<Wry>,
    /// The menu's header item. The mutex is held only to copy the handle out, never across a
    /// call into AppKit.
    header: Mutex<Option<MenuItem<Wry>>>,
}

impl TrayHandle for TauriTray {
    fn on_main_thread(&self, task: Box<dyn FnOnce() + Send>) -> Result<(), String> {
        self.app
            .run_on_main_thread(task)
            .map_err(|error| error.to_string())
    }

    fn after_delay(&self, task: Box<dyn FnOnce() + Send>) -> Result<(), String> {
        thread::Builder::new()
            .name("tray-retry".into())
            .spawn(move || {
                thread::sleep(RETRY_DELAY);
                task();
            })
            .map(drop)
            .map_err(|error| error.to_string())
    }

    fn set_title(&self, title: Option<&str>) -> Result<(), String> {
        self.icon
            .set_title(title)
            .map_err(|error| error.to_string())
    }

    fn set_tooltip(&self, label: &str) -> Result<(), String> {
        self.icon
            .set_tooltip(Some(label))
            .map_err(|error| error.to_string())
    }

    /// `with_inner_tray_icon` runs the closure inline here, since `draw` is on the main thread.
    #[cfg(target_os = "macos")]
    fn set_accessibility_label(&self, label: &str) -> Result<(), String> {
        let label = label.to_string();
        self.icon
            .with_inner_tray_icon(move |tray| match tray.ns_status_item() {
                Some(item) => {
                    orasenda_platform_macos::set_status_item_accessibility_label(&item, &label)
                        .map_err(|error| error.to_string())
                }
                None => Err("no status item".to_string()),
            })
            .map_err(|error| error.to_string())?
    }

    /// Other desktops read the tooltip as the item's name; there is nothing more to set.
    #[cfg(not(target_os = "macos"))]
    fn set_accessibility_label(&self, _label: &str) -> Result<(), String> {
        Ok(())
    }

    fn set_glyph(&self, glyph: Glyph) -> Result<(), String> {
        // `set_icon` alone drops the template flag on macOS (tray-icon 0.25.1).
        self.icon
            .set_icon_with_as_template(Some(glyph.image()), true)
            .map_err(|error| error.to_string())
    }

    fn set_menu(&self, items: &[MenuEntry], header: Option<&str>) -> Result<(), String> {
        let (menu, header_item) =
            build_menu(&self.app, items, header).map_err(|error| error.to_string())?;
        self.icon
            .set_menu(Some(menu))
            .map_err(|error| error.to_string())?;
        // Swap under the lock, drop the old item after it: dropping releases an AppKit object.
        let old = std::mem::replace(
            &mut *self.header.lock().unwrap_or_else(PoisonError::into_inner),
            header_item,
        );
        drop(old);
        Ok(())
    }

    fn set_header(&self, text: &str) -> Result<(), String> {
        let item = self
            .header
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone();
        match item {
            Some(item) => item.set_text(text).map_err(|error| error.to_string()),
            None => Err("the menu has no header item".to_string()),
        }
    }
}

/// Builds the idle menu-bar item and adds it to the [`Surfaces`] that `publish` renders.
pub fn setup(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let idle = TimerView::idle(
        crate::ipc::StoreStatus::Ok,
        orasenda_core::NotificationStatus::Unavailable,
    );
    let (_, glyph) = tray_title_and_icon(&idle);
    let next = NextSession::from_settings(&crate::runtime::session::current_settings(handle));
    let (menu, header) = build_menu(
        handle,
        &menu_items(&idle, &next, crate::spike::enabled()),
        None,
    )?;
    let icon = TrayIconBuilder::with_id(TRAY_ID)
        .icon(glyph.image())
        .icon_as_template(true)
        .tooltip(tray_label(&idle))
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| on_menu_event(app, event.id().as_ref()))
        .build(app)?;
    let tauri_tray = Arc::new(TauriTray {
        app: handle.clone(),
        icon,
        header: Mutex::new(header),
    });
    // The builder takes no accessibility label, so the idle item gets it here, on the main
    // thread like every tray call.
    let labelled = report(
        "set_accessibility_label",
        tauri_tray.set_accessibility_label(&tray_label(&idle)),
    );
    let tray = Tray::new(tauri_tray, &idle, next);
    if !labelled {
        // The first render then redoes every call, the label included.
        lock_state(&tray.state).drawn = None;
    }
    let tray: Arc<dyn NativeSurface> = Arc::new(tray);
    match app.try_state::<Surfaces>() {
        Some(surfaces) => surfaces
            .0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(tray),
        None => eprintln!("tray: no Surfaces in managed state; the menu bar won't follow"),
    }
    Ok(())
}
