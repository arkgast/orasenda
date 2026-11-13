//! Orasenda app shell: Tauri glue around `orasenda-core`. Logic and time live in Rust; the
//! webview renders (ADR-001). The IPC contract is typed by tauri-specta (ADR-007).

mod commands;
mod ipc;
mod lifecycle;
// The app menu: the pure parts build on every desktop target, the menu itself on macOS.
#[cfg(desktop)]
mod menu;
mod notifications;
mod platform;
mod runtime;
pub(crate) mod spike;
// The menu-bar item: Tauri's tray exists on desktop only.
#[cfg(desktop)]
mod tray;
#[cfg(test)]
mod window_min_tests;
mod windows;

include!("../commands.list.rs");

pub use ipc::ClockTick;

/// Every command and event the webview can use. `run()` and the bindings export share it.
pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            commands::app_info,
            commands::timer_state,
            commands::timer_start,
            commands::timer_pause,
            commands::timer_resume,
            commands::timer_stop,
            commands::timer_extend,
            commands::timer_set_intent,
            commands::timer_dismiss_offer,
            commands::timer_take_break,
            commands::hint_shown,
            commands::settings_get,
            commands::settings_set,
            commands::notifications_request,
            commands::notifications_open_settings,
            commands::navigate_take,
            commands::presets_list,
            commands::native_menu_popup,
            commands::displays_list,
            commands::focus_view_open,
            commands::focus_view_close,
            commands::main_show,
            commands::timer_view,
            commands::preset_select,
            commands::preset_add,
            commands::preset_update,
            commands::preset_remove,
            commands::preset_undo_remove,
            commands::presets_restore_defaults,
            commands::keyboard_state,
            commands::keyboard_set_shortcut,
            commands::keyboard_restore_default,
            spike::commands::spike_status,
            spike::commands::spike_running_apps,
            spike::commands::spike_rule,
            spike::commands::spike_set_rule,
            spike::commands::spike_usage,
            spike::commands::spike_overlay_ready,
            spike::commands::spike_overlay_choice,
        ])
        .events(tauri_specta::collect_events![
            ipc::ClockTickEvent,
            ipc::TimerTickEvent,
            ipc::TimerMilestoneEvent,
            ipc::SettingsChanged,
            ipc::PresetsChangedEvent,
            ipc::KeyboardChanged,
            ipc::Navigate,
            ipc::FocusInsets,
            ipc::PaletteOpen,
            spike::OverlayShow,
            spike::SpikeUsageChanged,
        ])
}

/// Where the generated TypeScript contract lives: `apps/orasenda/src/ipc/bindings.ts`.
#[cfg(any(test, all(debug_assertions, desktop)))]
fn bindings_path() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/ipc/bindings.ts")
}

#[cfg(any(test, all(debug_assertions, desktop)))]
fn export_bindings(builder: &tauri_specta::Builder<tauri::Wry>) -> Result<(), String> {
    builder
        .export(specta_typescript::Typescript::default(), bindings_path())
        .map_err(|error| error.to_string())
}

/// Starts the app.
///
/// On mobile, `mobile_entry_point` exports the symbols the native shells call into:
/// `start_app` for iOS and the `Java_*` JNI bindings for Android. The Tauri CLI rejects a
/// mobile library that lacks them. The macro also wraps `run` in `catch_unwind` and aborts on
/// a panic, so a panic here kills the mobile process instead of unwinding into Java or Swift.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = specta_builder();

    // Desktop debug builds only: a mobile build must not write to a host path.
    #[cfg(all(debug_assertions, desktop))]
    if let Err(error) = export_bindings(&builder) {
        eprintln!("could not export TypeScript bindings: {error}");
    }

    let context = tauri::generate_context!();
    let spike = spike::Spike::new(spike::enabled(), &context.config().identifier);

    let app = tauri::Builder::default()
        .manage(spike)
        .manage(runtime::session::Surfaces::default())
        .manage(lifecycle::PendingNavigate::default())
        .manage(commands::PopupSlot::default())
        .manage(windows::frames::Frames::default())
        .manage(notifications::Notifications::default())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            runtime::session::setup(app)?;
            runtime::keyboard::manage(app);
            runtime::keyboard::register_saved(app.handle());
            #[cfg(desktop)]
            tray::setup(app)?;
            runtime::ticker::spawn(runtime::ticker::AppHost::new(app.handle()))?;
            spike::setup(app)?;
            lifecycle::finish_launch(app.handle());
            // The first Focus menu and tray items, and the display observer.
            #[cfg(desktop)]
            windows::displays::install(app.handle());
            Ok(())
        });
    #[cfg(target_os = "macos")]
    let app = app.menu(menu::app_menu::build);
    #[cfg(desktop)]
    let app = app.on_menu_event(|app, event| {
        use tauri::Manager;
        let id = event.id().as_ref();
        if !app.state::<commands::PopupSlot>().record(id) {
            #[cfg(target_os = "macos")]
            menu::on_menu_event(app, id);
        }
    });
    lifecycle::install(app)
        .build(context)
        .expect("error while building Orasenda")
        .run(|app, event| match event {
            tauri::RunEvent::Exit => runtime::session::flush_on_exit(app),
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => lifecycle::on_reopen(app),
            _ => {}
        });
}

#[cfg(test)]
mod lib_tests;
