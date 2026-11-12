//! Display changes (spec: Display changes): when the screen parameters change, each open Focus
//! window is framed to its display again and told its insets, a Focus window whose display is
//! gone closes, a floater whose display is gone moves to the main window's display, and the
//! Focus menu and the menu-bar item are rebuilt. No window takes key focus.
//!
//! The pure steps ([`reframe_on`]) run over [`Ops`] and are tested with a fake. The platform
//! half sits on the macOS screen observer; every call runs off the main thread.

use orasenda_service::windows::{default_frame, frame_within};

#[cfg(desktop)]
use super::AppOps;
use super::floater::{EDGE_INSET, HEIGHT, LIMITS, WIDTH};
use super::focus::focus_label;
use super::{FLOATER, Ops, Screen};
#[cfg(desktop)]
use tauri::AppHandle;

/// Frames every open Focus window to its display and emits its insets; closes the ones whose
/// display is gone (or that can't be framed), then moves a stranded floater.
pub(crate) fn reframe_on<O: Ops>(ops: &O) {
    let screens = match ops.screens() {
        Ok(screens) => screens,
        Err(error) => {
            eprintln!("displays: could not read the displays: {}", error.message);
            return;
        }
    };
    for label in ops.focus_labels() {
        let Some(screen) = screens.iter().find(|s| focus_label(&s.id) == label) else {
            ops.close(&label);
            continue;
        };
        match ops.cover_display(&label, &screen.id) {
            Ok(()) => ops.emit_insets(&label, screen.insets),
            Err(error) => {
                eprintln!("displays: could not frame {label}: {}", error.message);
                ops.close(&label);
            }
        }
    }
    move_floater(ops, &screens);
}

/// A floater whose display is gone goes to the main window's display (the first display when
/// that is gone too) at that display's stored frame, or the default one. It is placed, not
/// keyed: the floater never takes focus on its own.
fn move_floater<O: Ops>(ops: &O, screens: &[Screen]) {
    if !ops.exists(FLOATER) {
        return;
    }
    let Some(current) = ops.window_display(FLOATER) else {
        return;
    };
    if screens.iter().any(|screen| screen.id == current) {
        return;
    }
    let Some(target) = ops
        .main_display()
        .and_then(|id| screens.iter().find(|screen| screen.id == id))
        .or_else(|| screens.first())
    else {
        return;
    };
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
        reframe_on(&AppOps::new(&app));
        refresh_surfaces(&app);
    });
}

/// Tells the Focus menu and the menu-bar item the displays and whether the floater is
/// shown. Reading the displays waits on the main thread, so this runs on a blocking one.
#[cfg(desktop)]
pub(crate) fn refresh_surfaces(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let displays = crate::commands::display_infos(&AppOps::new(&app));
        let floater_shown = super::floater_shown(&app);
        #[cfg(target_os = "macos")]
        {
            let on_main = app.clone();
            let displays = displays.clone();
            let queued = app.run_on_main_thread(move || {
                if let Err(error) =
                    crate::menu::focus_menu::rebuild(&on_main, &displays, floater_shown)
                {
                    eprintln!("displays: the Focus menu didn't follow: {error}");
                }
            });
            if let Err(error) = queued {
                eprintln!("displays: could not reach the main thread: {error}");
            }
        }
        crate::tray::focus_changed(
            &app,
            crate::tray::FocusItems {
                displays,
                floater_shown,
            },
        );
    });
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
