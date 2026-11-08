//! Orasenda app shell: Tauri glue around `orasenda-core`. Logic and time live in Rust; the
//! webview renders (ADR-001). The IPC contract is typed by tauri-specta (ADR-007).

mod commands;
pub mod spike;
mod ticker;

use serde::{Deserialize, Serialize};
use tauri::Manager;

include!("../commands.list.rs");

/// The wall clock, emitted as `clock-tick` on every whole second.
#[derive(Debug, Serialize, Deserialize, Clone, specta::Type, tauri_specta::Event)]
#[serde(rename_all = "camelCase")]
pub struct ClockTick {
    /// UTC milliseconds since the Unix epoch. Exported as `number`: lossless below 2^53.
    #[specta(type = specta_typescript::Number)]
    pub epoch_ms: u64,
}

/// Every command and event the webview can use. `run()` and the bindings export share it.
pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        .commands(tauri_specta::collect_commands![
            commands::app_info,
            spike::commands::spike_status,
            spike::commands::spike_running_apps,
            spike::commands::spike_set_rule,
            spike::commands::spike_usage,
            spike::commands::spike_overlay_ready,
            spike::commands::spike_overlay_choice,
        ])
        .events(tauri_specta::collect_events![
            ClockTick,
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
pub fn run() {
    let builder = specta_builder();

    // Desktop debug builds only: a mobile build must not write to a host path.
    #[cfg(all(debug_assertions, desktop))]
    if let Err(error) = export_bindings(&builder) {
        eprintln!("could not export TypeScript bindings: {error}");
    }

    let context = tauri::generate_context!();
    let spike = spike::Spike::new(spike::enabled(), &context.config().identifier);

    tauri::Builder::default()
        .manage(spike)
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            ticker::spawn(app.handle().clone())?;
            spike::setup(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(true) = event {
                ticker::emit_now(window.app_handle());
            }
        })
        .run(context)
        .expect("error while running Orasenda");
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
        };
        assert_eq!(
            serde_json::to_value(&tick).unwrap(),
            serde_json::json!({ "epochMs": 1_794_009_600_123_u64 })
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
    fn main_capability_includes_spike_commands() {
        let (windows, permissions) = capability("main.json");
        assert_eq!(windows, ["main"]);
        for granted in [
            "allow-spike-status",
            "allow-spike-running-apps",
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
        assert!(
            bindings.contains("epochMs: number"),
            "epochMs is not a number:\n{bindings}"
        );
    }
}
