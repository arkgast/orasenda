//! Orasenda app shell: Tauri glue around `orasenda-core`. Logic and time live in Rust; the
//! webview renders (ADR-001). The IPC contract is typed by tauri-specta (ADR-007).

mod commands;
mod ipc;
mod lifecycle;
mod platform;
mod scheduler;
mod session;
pub(crate) mod spike;
// The menu-bar item: Tauri's tray exists on desktop only.
#[cfg(desktop)]
mod tray;

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
            commands::settings_get,
            commands::settings_set,
            spike::commands::spike_status,
            spike::commands::spike_running_apps,
            spike::commands::spike_rule,
            spike::commands::spike_set_rule,
            spike::commands::spike_usage,
            spike::commands::spike_overlay_ready,
            spike::commands::spike_overlay_choice,
        ])
        .events(tauri_specta::collect_events![
            ClockTick,
            ipc::TimerView,
            ipc::MilestoneEvent,
            spike::OverlayShow,
            spike::SpikeUsageChanged,
        ])
}

/// Where the generated TypeScript contract lives: `apps/orasenda/src/bindings.ts`.
#[cfg(any(test, all(debug_assertions, desktop)))]
fn bindings_path() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/bindings.ts")
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
        .manage(session::Surfaces::default())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            session::setup(app)?;
            #[cfg(desktop)]
            tray::setup(app)?;
            scheduler::spawn(app.handle().clone())?;
            spike::setup(app)?;
            Ok(())
        });
    lifecycle::install(app)
        .build(context)
        .expect("error while building Orasenda")
        .run(|app, event| match event {
            tauri::RunEvent::Exit => session::flush_on_exit(app),
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => lifecycle::on_reopen(app),
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use tauri_specta::{BuilderConfiguration, Event, LanguageExt};

    use super::*;

    /// A tauri-specta "language" that records the registered command names instead of
    /// writing a file: the builder's configuration is only reachable through an exporter.
    struct CommandNames<'a>(&'a mut Vec<String>);

    impl LanguageExt for CommandNames<'_> {
        type Error = std::io::Error;

        fn export(self, cfg: &BuilderConfiguration, _path: &Path) -> Result<(), Self::Error> {
            self.0.extend(
                cfg.commands
                    .iter()
                    .map(|command| command.name().to_string()),
            );
            Ok(())
        }
    }

    #[test]
    fn manifest_commands_match_specta_builder() {
        let mut registered = Vec::new();
        specta_builder()
            .export(CommandNames(&mut registered), "unused")
            .unwrap();
        registered.sort();
        let mut manifest: Vec<String> = COMMANDS.iter().map(|name| name.to_string()).collect();
        manifest.sort();
        assert_eq!(registered, manifest);
    }

    #[test]
    fn clock_tick_serializes_as_epoch_ms_camel_case() {
        let tick = ClockTick {
            epoch_ms: 1_794_009_600_123,
            clock: "09:30".into(),
            idle_finish: None,
        };
        assert_eq!(
            serde_json::to_value(&tick).unwrap(),
            serde_json::json!({ "epochMs": 1_794_009_600_123_u64, "clock": "09:30", "idleFinish": null })
        );
        assert_eq!(ClockTick::NAME, "clock-tick");
    }

    /// The permission identifiers a capability file grants, and the windows it applies to.
    fn capability(file: &str) -> (Vec<String>, Vec<String>) {
        let path = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("capabilities")
            .join(file);
        let text = std::fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("{}: {error}", path.display()));
        let json: serde_json::Value = serde_json::from_str(&text).unwrap();
        let strings = |key: &str| -> Vec<String> {
            json[key]
                .as_array()
                .unwrap_or_else(|| panic!("{file}: no {key} array"))
                .iter()
                .map(|value| value.as_str().unwrap().to_string())
                .collect()
        };
        (strings("windows"), strings("permissions"))
    }

    #[test]
    fn overlay_capability_grants_only_overlay_choice() {
        let (windows, mut permissions) = capability("overlay.json");
        assert_eq!(windows, ["overlay"]);
        permissions.sort();
        assert_eq!(
            permissions,
            [
                "allow-spike-overlay-choice",
                "allow-spike-overlay-ready",
                "core:event:allow-listen",
                "core:event:allow-unlisten",
            ]
        );
    }

    #[test]
    fn main_capability_grants_timer_and_settings_commands() {
        let (windows, permissions) = capability("main.json");
        assert_eq!(windows, ["main"]);
        for granted in [
            "allow-timer-state",
            "allow-timer-start",
            "allow-timer-pause",
            "allow-timer-resume",
            "allow-timer-stop",
            "allow-settings-get",
            "allow-settings-set",
        ] {
            assert!(
                permissions.iter().any(|p| p == granted),
                "main lacks {granted}"
            );
        }
    }

    #[test]
    fn main_capability_includes_spike_commands() {
        let (windows, permissions) = capability("main.json");
        assert_eq!(windows, ["main"]);
        for granted in [
            "allow-spike-status",
            "allow-spike-running-apps",
            "allow-spike-rule",
            "allow-spike-set-rule",
            "allow-spike-usage",
        ] {
            assert!(
                permissions.iter().any(|p| p == granted),
                "main lacks {granted}"
            );
        }
        for withheld in ["allow-spike-overlay-choice", "allow-spike-overlay-ready"] {
            assert!(
                !permissions.iter().any(|p| p == withheld),
                "main has {withheld}"
            );
        }
    }

    /// Regenerates `bindings.ts`; `just ci` fails when the committed file differs.
    #[test]
    fn export_bindings() {
        super::export_bindings(&specta_builder()).unwrap();
        let bindings = std::fs::read_to_string(bindings_path()).unwrap();
        assert!(
            bindings.contains("appInfo"),
            "no appInfo command:\n{bindings}"
        );
        assert!(
            bindings.contains("clockTick"),
            "no clockTick event:\n{bindings}"
        );
        for needle in [
            "timerTick",
            "timerMilestone",
            "idleFinish: string | null",
            "remainingMs: number",
            "progress: number",
            "timerStart: (request: StartRequest_Deserialize) => typedError<TimerView_Serialize, TimerCommandError>",
            "timerStop: () => typedError<TimerView_Serialize, TimerCommandError>",
            "timerPause: () => typedError<TimerView_Serialize, TimerCommandError>",
            "timerResume: () => typedError<TimerView_Serialize, TimerCommandError>",
            "typedError<null, SettingsError>",
        ] {
            assert!(
                bindings.contains(needle),
                "bindings lack {needle}:\n{bindings}"
            );
        }
        assert!(!bindings.contains("progress: number | null"));
        assert!(
            bindings.contains("epochMs: number"),
            "epochMs is not a number:\n{bindings}"
        );
    }
}
