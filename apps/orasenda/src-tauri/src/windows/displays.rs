//! Display changes (spec: Display changes): when the screen parameters change, a floater whose
//! display is gone moves to the main window's display, and the Focus menu and the menu-bar item
//! are rebuilt. No window takes key focus.
//!
//! The pure steps ([`reframe_on`]) run over [`Ops`] and are tested with a fake. The platform
//! half sits on the macOS screen observer; every call runs off the main thread.

use orasenda_service::windows::{default_frame, frame_within};

#[cfg(desktop)]
use super::AppOps;
use super::floater::{EDGE_INSET, HEIGHT, LIMITS, WIDTH};
use super::{FLOATER, Ops, Screen};
#[cfg(desktop)]
use tauri::AppHandle;

/// Moves a stranded floater to a connected display.
pub(crate) fn reframe_on<O: Ops>(ops: &O) {
    let screens = match ops.screens() {
        Ok(screens) => screens,
        Err(error) => {
            eprintln!("displays: could not read the displays: {}", error.message);
            return;
        }
    };
    move_floater(ops, &screens);
}

/// A floater whose display is gone goes to the main window's display (the first display when
/// that is gone too) at that display's stored frame, or the default one. It is placed, not
/// keyed: the floater never takes focus on its own.
fn move_floater<O: Ops>(ops: &O, screens: &[Screen]) {
    if !ops.exists(FLOATER) {
        return;
    }
    // A display that can't be read counts as gone: the floater is placed, not left stranded.
    match ops.window_display(FLOATER) {
        Some(current) if screens.iter().any(|screen| screen.id == current) => return,
        Some(_) => {}
        None => eprintln!("displays: the floater's display is unknown; moving it"),
    }
    let Some(target) = ops
        .main_display()
        .and_then(|id| screens.iter().find(|screen| screen.id == id))
        .or_else(|| screens.first())
    else {
        return;
    };
    ops.migrate_frames(screens);
    let frame = match ops
        .load_frame(&[target.id.as_str()])
        .filter(|(display, _)| display == &target.id)
    {
        Some((_, stored)) => frame_within(stored, target.visible, LIMITS),
        None => default_frame(target.visible, (WIDTH, HEIGHT), EDGE_INSET),
    };
    if let Err(error) = ops.place(FLOATER, &target.id, frame) {
        eprintln!("displays: could not move the floater: {}", error.message);
    }
}

/// The screen parameters changed (called from the macOS observer, on the main thread):
/// reframes the windows, then rebuilds the menus, on a blocking thread.
#[cfg(desktop)]
pub(crate) fn on_screens_changed(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        serialized(&REFRESH, || reframe_on(&AppOps::new(&app)));
        refresh_surfaces(&app);
    });
}

/// One refresh at a time: the reads and the apply happen under this lock, so the newest
/// refresh is always the last one applied.
#[cfg(desktop)]
static REFRESH: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// The displays the Focus menu was last built for (never held across a main-thread wait).
#[cfg(all(desktop, target_os = "macos"))]
static MENU_DISPLAYS: std::sync::Mutex<Option<Vec<crate::ipc::DisplayInfo>>> =
    std::sync::Mutex::new(None);

/// Runs `step` while holding `lock`; a poisoned lock still serializes.
pub(crate) fn serialized<R>(lock: &std::sync::Mutex<()>, step: impl FnOnce() -> R) -> R {
    let _guard = lock
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    step()
}

/// Tells the Focus menu and the menu-bar item the displays and whether the floater is
/// shown. Reading the displays waits on the main thread, so this runs on a blocking one.
/// The View menu is rebuilt only when the displays changed.
#[cfg(desktop)]
pub(crate) fn refresh_surfaces(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        serialized(&REFRESH, || {
            let displays = crate::commands::display_infos(&AppOps::new(&app));
            let floater_shown = super::floater_shown(&app);
            #[cfg(target_os = "macos")]
            rebuild_focus_menu(&app, &displays);
            crate::tray::focus_changed(
                &app,
                crate::tray::FocusItems {
                    displays,
                    floater_shown,
                },
            );
        });
    });
}

#[cfg(all(desktop, target_os = "macos"))]
fn rebuild_focus_menu(app: &AppHandle, displays: &[crate::ipc::DisplayInfo]) {
    fn last() -> std::sync::MutexGuard<'static, Option<Vec<crate::ipc::DisplayInfo>>> {
        MENU_DISPLAYS
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
    {
        let mut known = last();
        if known.as_deref() == Some(displays) {
            return;
        }
        *known = Some(displays.to_vec());
    }
    let view = crate::runtime::keyboard::state(app);
    let on_main = app.clone();
    let owned = displays.to_vec();
    let queued = app.run_on_main_thread(move || {
        if let Err(error) = crate::menu::rebuild_view(&on_main, &view, owned.len()) {
            eprintln!("displays: the View menu didn't follow: {error}");
            *last() = None;
        }
    });
    if let Err(error) = queued {
        eprintln!("displays: could not reach the main thread: {error}");
        *last() = None;
    }
}

/// Fills the Focus menu and the tray once at launch, and (macOS) starts watching the
/// screen parameters for the life of the app.
#[cfg(desktop)]
pub(crate) fn install(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let handle = app.clone();
        match orasenda_platform_macos::windows::observe_screen_changes(Box::new(move || {
            on_screens_changed(&handle);
        })) {
            // One observer for the whole run: dropping it would stop the updates.
            Ok(observer) => std::mem::forget(observer),
            Err(error) => eprintln!("displays: not watching the displays: {error}"),
        }
    }
    refresh_surfaces(app);
}
