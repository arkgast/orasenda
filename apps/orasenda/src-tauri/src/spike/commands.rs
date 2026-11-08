//! Spike commands. Each one is listed in `commands.list.rs` and granted in a capability:
//! `main` gets status, running apps, rule and usage; `overlay` gets ready and choice.
//!
//! The `#[tauri::command]` functions are thin: the logic lives in plain functions over
//! [`Spike`], so it is tested with a fake [`SpikePlatform`].

use orasenda_core::{AppRef, BlockRule, PlatformError, SAFETY_ALLOWLIST, UsageSegment};
use serde::{Deserialize, Serialize};
use tauri::State;

use super::{Spike, SpikePlatform};

/// Whether the spike runs, and whether this OS has an implementation installed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SpikeStatus {
    pub enabled: bool,
    pub platform_supported: bool,
}

/// Why a spike command failed. Serialized as `{ kind, message }`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SpikeError {
    /// The spike flag is off (or this is a release build). Wins over `Unsupported`.
    Disabled,
    /// No spike implementation for this OS.
    Unsupported,
    /// The OS call failed.
    Platform(String),
}

/// What the user chose in the overlay.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum OverlayChoice {
    /// *Back to focus*.
    Return,
    /// *Continue*, with the optional reason (logged, never stored).
    Continue { reason: Option<String> },
}

impl std::fmt::Display for SpikeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SpikeError::Disabled => f.write_str("the spike is disabled"),
            SpikeError::Unsupported => f.write_str("the spike is not supported on this platform"),
            SpikeError::Platform(message) => f.write_str(message),
        }
    }
}

impl std::error::Error for SpikeError {}

/// The wire shape of [`SpikeError`], which TypeScript sees as `SpikeError`.
mod wire {
    use serde::Serialize;

    /// Which spike error: `disabled` wins over `unsupported`.
    #[derive(Serialize, specta::Type)]
    #[serde(rename_all = "lowercase")]
    pub enum SpikeErrorKind {
        Disabled,
        Unsupported,
        Platform,
    }

    /// Why a spike command failed, with a message for the log.
    #[derive(Serialize, specta::Type)]
    #[serde(rename_all = "camelCase")]
    pub struct SpikeError {
        pub kind: SpikeErrorKind,
        pub message: String,
    }
}

impl Serialize for SpikeError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let kind = match self {
            SpikeError::Disabled => wire::SpikeErrorKind::Disabled,
            SpikeError::Unsupported => wire::SpikeErrorKind::Unsupported,
            SpikeError::Platform(_) => wire::SpikeErrorKind::Platform,
        };
        wire::SpikeError {
            kind,
            message: self.to_string(),
        }
        .serialize(serializer)
    }
}

impl specta::Type for SpikeError {
    fn definition(types: &mut specta::Types) -> specta::datatype::DataType {
        <wire::SpikeError as specta::Type>::definition(types)
    }
}

/// `Disabled` when the flag is off, else `Unsupported` without a platform.
fn platform(spike: &Spike) -> Result<&dyn SpikePlatform, SpikeError> {
    if !spike.enabled() {
        return Err(SpikeError::Disabled);
    }
    spike.platform().ok_or(SpikeError::Unsupported)
}

pub fn status(spike: &Spike) -> SpikeStatus {
    SpikeStatus {
        enabled: spike.enabled(),
        platform_supported: spike.platform().is_some(),
    }
}

pub fn running_apps(spike: &Spike) -> Result<Vec<AppRef>, SpikeError> {
    let platform = platform(spike)?;
    let apps = platform.running_apps();
    let extra_allow = spike.state().extra_allow.clone();
    Ok(selectable_apps(apps, spike.own_bundle_id(), &extra_allow))
}

/// Apps the dev panel may offer as targets: with a bundle ID (the rule targets bundle IDs;
/// apps without one are never intercepted), not Orasenda, not on the safety allowlist or
/// `extra_allow`, sorted by name (case-insensitive).
fn selectable_apps(apps: Vec<AppRef>, own_bundle_id: &str, extra_allow: &[String]) -> Vec<AppRef> {
    let mut apps: Vec<AppRef> = apps
        .into_iter()
        .filter(|app| {
            app.bundle_id.as_deref().is_some_and(|id| {
                id != own_bundle_id
                    && !SAFETY_ALLOWLIST.contains(&id)
                    && !extra_allow.iter().any(|allowed| allowed == id)
            })
        })
        .collect();
    apps.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.name.cmp(&b.name))
    });
    apps
}

pub fn set_rule(spike: &Spike, rule: BlockRule) -> Result<(), SpikeError> {
    platform(spike)?;
    spike.state().rule = rule;
    Ok(())
}

/// At most this many segments go to the dev panel.
const USAGE_LIMIT: usize = 20;

pub fn usage(spike: &Spike) -> Result<Vec<UsageSegment>, SpikeError> {
    platform(spike)?;
    let state = spike.state();
    Ok(state
        .tracker
        .segments()
        .iter()
        .rev()
        .take(USAGE_LIMIT)
        .cloned()
        .collect())
}

pub fn overlay_ready(spike: &Spike) -> Result<(), SpikeError> {
    let platform = platform(spike)?;
    let pending = spike.state().pending_show.clone();
    if let Some(show) = pending {
        platform.show_overlay(show).map_err(platform_error)?;
    }
    Ok(())
}

pub fn overlay_choice(spike: &Spike, choice: OverlayChoice) -> Result<(), SpikeError> {
    let platform = platform(spike)?;
    match choice {
        OverlayChoice::Return => back_to_focus(spike, platform),
        OverlayChoice::Continue { reason } => continue_to_target(spike, platform, reason),
    }
}

/// Hides or closes the target, closes the overlay, then lands in the previous app if it is
/// still running, otherwise in Orasenda's main window.
fn back_to_focus(spike: &Spike, platform: &dyn SpikePlatform) -> Result<(), SpikeError> {
    let (target, previous, action) = {
        let state = spike.state();
        (
            state.target.clone(),
            state.previous.clone(),
            state.rule.action,
        )
    };
    if let Some(target) = &target
        && let Err(error) = platform.hide_or_close(target.pid, action)
    {
        eprintln!("spike: could not {action:?} {}: {error}", target.name);
    }
    let hidden = platform.hide_overlay();
    close_overlay(spike);
    hidden.map_err(platform_error)?;

    let running = previous.filter(|previous| {
        platform
            .running_apps()
            .iter()
            .any(|app| app.pid == previous.pid)
    });
    if let Some(previous) = running {
        match platform.activate(previous.pid) {
            Ok(()) => return Ok(()),
            Err(error) => eprintln!("spike: could not activate {}: {error}", previous.name),
        }
    }
    platform.show_main().map_err(|error| {
        eprintln!("spike: could not show the main window: {error}");
        platform_error(error)
    })
}

/// Allows the target until another countable app comes to the front, closes the overlay
/// and lands in the target. The reason is logged, never stored.
fn continue_to_target(
    spike: &Spike,
    platform: &dyn SpikePlatform,
    reason: Option<String>,
) -> Result<(), SpikeError> {
    let target = {
        let mut state = spike.state();
        let target = state.target.clone();
        if let Some(id) = target.as_ref().and_then(|t| t.bundle_id.as_deref()) {
            state.gate.allow(id);
        }
        target
    };
    if let Some(target) = &target {
        eprintln!("spike: continue to {}, reason: {reason:?}", target.name);
    }
    let hidden = platform.hide_overlay();
    close_overlay(spike);
    hidden.map_err(platform_error)?;
    match target {
        Some(target) => platform.activate(target.pid).map_err(platform_error),
        None => Ok(()),
    }
}

/// Forgets the open overlay: the gate re-enables and nothing is pending.
fn close_overlay(spike: &Spike) {
    let mut state = spike.state();
    state.gate.overlay_closed();
    state.target = None;
    state.pending_show = None;
}

fn platform_error(error: PlatformError) -> SpikeError {
    SpikeError::Platform(error.to_string())
}

/// Whether the spike runs and the platform is supported. Never errors.
#[tauri::command]
#[specta::specta]
pub fn spike_status(spike: State<'_, Spike>) -> SpikeStatus {
    status(&spike)
}

/// Regular running apps, sorted by name, without Orasenda and the safety allowlist.
#[tauri::command]
#[specta::specta]
pub fn spike_running_apps(spike: State<'_, Spike>) -> Result<Vec<AppRef>, SpikeError> {
    running_apps(&spike)
}

/// Replaces the block rule; it applies from the next foreground change.
#[tauri::command]
#[specta::specta]
pub fn spike_set_rule(spike: State<'_, Spike>, rule: BlockRule) -> Result<(), SpikeError> {
    set_rule(&spike, rule)
}

/// Usage segments, newest first, at most 20.
#[tauri::command]
#[specta::specta]
pub fn spike_usage(spike: State<'_, Spike>) -> Result<Vec<UsageSegment>, SpikeError> {
    usage(&spike)
}

/// The overlay page is listening; re-emits the pending `overlay-show`, if any.
#[tauri::command]
#[specta::specta]
pub fn spike_overlay_ready(spike: State<'_, Spike>) -> Result<(), SpikeError> {
    overlay_ready(&spike)
}

/// *Back to focus* or *Continue* from the overlay.
#[tauri::command]
#[specta::specta]
pub fn spike_overlay_choice(
    spike: State<'_, Spike>,
    choice: OverlayChoice,
) -> Result<(), SpikeError> {
    overlay_choice(&spike, choice)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex, Weak};

    use orasenda_core::{BlockAction, Decision, GateAction, PlatformError};

    use super::*;
    use crate::spike::OverlayShow;

    const OWN: &str = "com.veloud.orasenda";

    #[derive(Debug, Clone, PartialEq, Eq)]
    enum Call {
        HideOrClose(i32, BlockAction),
        Activate(i32),
        ShowOverlay(OverlayShow),
        HideOverlay,
        ShowMain,
    }

    /// Which fake calls fail with `PlatformError::Refused` (they are still recorded).
    #[derive(Debug, Clone, Copy, Default)]
    struct Failing {
        hide_or_close: bool,
        activate: bool,
        hide_overlay: bool,
        show_main: bool,
    }

    /// Records every call and fails the test if the state lock is held during one.
    struct Fake {
        spike: Weak<Spike>,
        running: Vec<AppRef>,
        failing: Failing,
        calls: Arc<Mutex<Vec<Call>>>,
    }

    impl Fake {
        fn record(&self, call: Call) -> Result<(), PlatformError> {
            let spike = self.spike.upgrade().expect("spike alive");
            assert!(!spike.is_locked(), "state lock held during {call:?}");
            let fails = match call {
                Call::HideOrClose(..) => self.failing.hide_or_close,
                Call::Activate(_) => self.failing.activate,
                Call::HideOverlay => self.failing.hide_overlay,
                Call::ShowMain => self.failing.show_main,
                Call::ShowOverlay(_) => false,
            };
            self.calls.lock().unwrap().push(call);
            if fails {
                Err(PlatformError::Refused)
            } else {
                Ok(())
            }
        }
    }

    impl SpikePlatform for Fake {
        fn running_apps(&self) -> Vec<AppRef> {
            let spike = self.spike.upgrade().expect("spike alive");
            assert!(!spike.is_locked(), "state lock held during running_apps");
            self.running.clone()
        }
        fn hide_or_close(&self, pid: i32, action: BlockAction) -> Result<(), PlatformError> {
            self.record(Call::HideOrClose(pid, action))
        }
        fn activate(&self, pid: i32) -> Result<(), PlatformError> {
            self.record(Call::Activate(pid))
        }
        fn show_overlay(&self, show: OverlayShow) -> Result<(), PlatformError> {
            self.record(Call::ShowOverlay(show))
        }
        fn hide_overlay(&self) -> Result<(), PlatformError> {
            self.record(Call::HideOverlay)
        }
        fn show_main(&self) -> Result<(), PlatformError> {
            self.record(Call::ShowMain)
        }
    }

    fn app(id: Option<&str>, name: &str, pid: i32) -> AppRef {
        AppRef {
            bundle_id: id.map(str::to_owned),
            name: name.to_owned(),
            pid,
        }
    }

    /// An enabled spike with a fake that reports `running` as the running apps.
    fn spike_with(running: Vec<AppRef>) -> (Arc<Spike>, Arc<Mutex<Vec<Call>>>) {
        spike_failing(running, Failing::default(), OWN)
    }

    /// Like [`spike_with`], with failing calls and Orasenda's own bundle ID chosen.
    fn spike_failing(
        running: Vec<AppRef>,
        failing: Failing,
        own: &str,
    ) -> (Arc<Spike>, Arc<Mutex<Vec<Call>>>) {
        let spike = Arc::new(Spike::new(true, own));
        let calls = Arc::new(Mutex::new(Vec::new()));
        let fake = Fake {
            spike: Arc::downgrade(&spike),
            running,
            failing,
            calls: Arc::clone(&calls),
        };
        spike.install(Box::new(fake)).unwrap();
        (spike, calls)
    }

    fn calls(log: &Arc<Mutex<Vec<Call>>>) -> Vec<Call> {
        log.lock().unwrap().clone()
    }

    /// An open overlay for `target`, opened after `previous` was in front.
    fn open_overlay(
        spike: &Spike,
        target: &AppRef,
        previous: Option<&AppRef>,
        action: BlockAction,
    ) {
        let mut state = spike.state();
        state.rule = BlockRule {
            targets: target.bundle_id.iter().cloned().collect(),
            action,
        };
        state.previous = previous.cloned();
        state.target = Some(target.clone());
        let id = target.bundle_id.as_deref().unwrap();
        state.gate.overlay_open(id);
        state.pending_show = Some(OverlayShow {
            app_name: target.name.clone(),
        });
    }

    #[test]
    fn spike_disabled_without_flag() {
        assert!(!crate::spike::enabled_from(true, None));
        assert!(!crate::spike::enabled_from(true, Some("0")));
        assert!(!crate::spike::enabled_from(false, Some("1")));
        assert!(crate::spike::enabled_from(true, Some("1")));

        let spike = Spike::new(false, OWN);
        assert_eq!(
            status(&spike),
            SpikeStatus {
                enabled: false,
                platform_supported: false
            }
        );
        assert_eq!(running_apps(&spike), Err(SpikeError::Disabled));
        assert_eq!(
            set_rule(&spike, BlockRule::default()),
            Err(SpikeError::Disabled)
        );
        assert_eq!(usage(&spike), Err(SpikeError::Disabled));
        assert_eq!(overlay_ready(&spike), Err(SpikeError::Disabled));
        assert_eq!(
            overlay_choice(&spike, OverlayChoice::Return),
            Err(SpikeError::Disabled)
        );
    }

    #[test]
    fn disabled_spike_installs_no_platform() {
        let spike = Arc::new(Spike::new(false, OWN));
        let fake = Fake {
            spike: Arc::downgrade(&spike),
            running: Vec::new(),
            failing: Failing::default(),
            calls: Arc::default(),
        };
        assert!(spike.install(Box::new(fake)).is_err());
        assert!(spike.platform().is_none());
    }

    #[test]
    fn disabled_wins_over_unsupported() {
        // Disabled and no platform: Disabled.
        let disabled = Spike::new(false, OWN);
        assert!(disabled.platform().is_none());
        assert_eq!(usage(&disabled), Err(SpikeError::Disabled));
        // Enabled but no platform: Unsupported.
        let unsupported = Spike::new(true, OWN);
        assert_eq!(
            status(&unsupported),
            SpikeStatus {
                enabled: true,
                platform_supported: false
            }
        );
        assert_eq!(running_apps(&unsupported), Err(SpikeError::Unsupported));
        assert_eq!(
            set_rule(&unsupported, BlockRule::default()),
            Err(SpikeError::Unsupported)
        );
        assert_eq!(usage(&unsupported), Err(SpikeError::Unsupported));
        assert_eq!(overlay_ready(&unsupported), Err(SpikeError::Unsupported));
        assert_eq!(
            overlay_choice(&unsupported, OverlayChoice::Return),
            Err(SpikeError::Unsupported)
        );
        // Enabled with a platform: supported.
        let (spike, _) = spike_with(Vec::new());
        assert_eq!(
            status(&spike),
            SpikeStatus {
                enabled: true,
                platform_supported: true
            }
        );
    }

    #[test]
    fn overlay_choice_serializes_tagged() {
        assert_eq!(
            serde_json::to_value(OverlayChoice::Return).unwrap(),
            serde_json::json!({ "kind": "return" })
        );
        assert_eq!(
            serde_json::to_value(OverlayChoice::Continue {
                reason: Some("reply".into())
            })
            .unwrap(),
            serde_json::json!({ "kind": "continue", "reason": "reply" })
        );
        let parsed: OverlayChoice =
            serde_json::from_value(serde_json::json!({ "kind": "continue", "reason": null }))
                .unwrap();
        assert_eq!(parsed, OverlayChoice::Continue { reason: None });
    }

    #[test]
    fn spike_error_serializes_kind_message() {
        assert_eq!(
            serde_json::to_value(SpikeError::Disabled).unwrap(),
            serde_json::json!({ "kind": "disabled", "message": "the spike is disabled" })
        );
        assert_eq!(
            serde_json::to_value(SpikeError::Unsupported).unwrap()["kind"],
            "unsupported"
        );
        assert_eq!(
            serde_json::to_value(SpikeError::Platform("boom".into())).unwrap(),
            serde_json::json!({ "kind": "platform", "message": "boom" })
        );
    }

    #[test]
    fn overlay_show_serializes_app_name() {
        use tauri_specta::Event;

        assert_eq!(
            serde_json::to_value(OverlayShow {
                app_name: "Mail".into()
            })
            .unwrap(),
            serde_json::json!({ "appName": "Mail" })
        );
        assert_eq!(OverlayShow::NAME, "overlay-show");
        assert_eq!(crate::spike::SpikeUsageChanged::NAME, "spike-usage-changed");
    }

    #[test]
    fn running_apps_sorted_and_filtered() {
        // An own ID that is not on the safety allowlist, so the own-bundle filter is tested.
        let (spike, _) = spike_failing(
            vec![
                app(Some("com.x.zed"), "Zed", 1),
                app(Some("com.x.self"), "Orasenda", 2),
                app(Some("com.apple.FaceTime"), "FaceTime", 3),
                app(Some("com.x.arc"), "arc", 4),
                app(Some("com.apple.mobilephone"), "Phone", 5),
                app(Some("com.x.mail"), "Mail", 6),
                app(None, "tool", 7),
            ],
            Failing::default(),
            "com.x.self",
        );
        spike.state().extra_allow = vec!["com.apple.mobilephone".into()];
        let names: Vec<String> = running_apps(&spike)
            .unwrap()
            .into_iter()
            .map(|a| a.name)
            .collect();
        assert_eq!(names, ["arc", "Mail", "Zed"]);
    }

    #[test]
    fn set_rule_replaces_rule_and_usage_is_newest_first() {
        let (spike, _) = spike_with(Vec::new());
        let rule = BlockRule {
            targets: ["com.x.a".to_owned()].into(),
            action: BlockAction::Close,
        };
        set_rule(&spike, rule.clone()).unwrap();
        assert_eq!(spike.state().rule, rule);

        for i in 0..25u64 {
            spike
                .state()
                .tracker
                .on_foreground(&app(Some("com.x.a"), &format!("A{i}"), 1), i * 1000);
        }
        let segments = usage(&spike).unwrap();
        assert_eq!(segments.len(), 20);
        assert_eq!(segments[0].name, "A24");
        assert_eq!(segments[19].name, "A5");
    }

    #[test]
    fn return_hides_target_then_activates_previous() {
        let target = app(Some("com.x.game"), "Game", 10);
        let previous = app(Some("com.x.editor"), "Editor", 20);
        let (spike, log) = spike_with(vec![target.clone(), previous.clone()]);
        open_overlay(&spike, &target, Some(&previous), BlockAction::Close);

        overlay_choice(&spike, OverlayChoice::Return).unwrap();

        assert_eq!(
            calls(&log),
            [
                Call::HideOrClose(10, BlockAction::Close),
                Call::HideOverlay,
                Call::Activate(20),
            ]
        );
        let mut state = spike.state();
        assert_eq!(state.target, None);
        assert_eq!(state.pending_show, None);
        // The gate is closed: the target shows the overlay again.
        assert_eq!(
            state.gate.on_foreground(&target, Decision::Intercept),
            GateAction::Show
        );
    }

    #[test]
    fn return_without_running_previous_shows_main() {
        let target = app(Some("com.x.game"), "Game", 10);
        let gone = app(Some("com.x.editor"), "Editor", 20);
        let (spike, log) = spike_with(vec![target.clone()]);
        open_overlay(&spike, &target, Some(&gone), BlockAction::Hide);

        overlay_choice(&spike, OverlayChoice::Return).unwrap();

        assert_eq!(
            calls(&log),
            [
                Call::HideOrClose(10, BlockAction::Hide),
                Call::HideOverlay,
                Call::ShowMain,
            ]
        );

        // No previous app at all: also the main window.
        let (spike, log) = spike_with(vec![target.clone()]);
        open_overlay(&spike, &target, None, BlockAction::Hide);
        overlay_choice(&spike, OverlayChoice::Return).unwrap();
        assert_eq!(calls(&log).last(), Some(&Call::ShowMain));
    }

    #[test]
    fn continue_allows_and_activates_target() {
        let target = app(Some("com.x.game"), "Game", 10);
        let previous = app(Some("com.x.editor"), "Editor", 20);
        let (spike, log) = spike_with(vec![target.clone(), previous.clone()]);
        open_overlay(&spike, &target, Some(&previous), BlockAction::Hide);

        overlay_choice(
            &spike,
            OverlayChoice::Continue {
                reason: Some("reply to a message".into()),
            },
        )
        .unwrap();

        assert_eq!(calls(&log), [Call::HideOverlay, Call::Activate(10)]);
        let mut state = spike.state();
        assert_eq!(state.target, None);
        assert_eq!(state.pending_show, None);
        // Allowed and closed: the target comes back without an overlay.
        assert_eq!(
            state.gate.on_foreground(&target, Decision::Intercept),
            GateAction::Ignore
        );
        // The reason is not kept anywhere in the state.
        assert!(!format!("{state:?}").contains("reply to a message"));
    }

    /// The gate is closed and nothing is pending for the overlay.
    fn assert_overlay_closed(spike: &Spike, target: &AppRef) {
        let mut state = spike.state();
        assert_eq!(state.target, None);
        assert_eq!(state.pending_show, None);
        assert_eq!(
            state.gate.on_foreground(target, Decision::Intercept),
            GateAction::Show
        );
    }

    #[test]
    fn return_when_hide_or_close_fails_still_hides_overlay() {
        let target = app(Some("com.x.game"), "Game", 10);
        let previous = app(Some("com.x.editor"), "Editor", 20);
        let failing = Failing {
            hide_or_close: true,
            ..Failing::default()
        };
        let (spike, log) = spike_failing(vec![target.clone(), previous.clone()], failing, OWN);
        open_overlay(&spike, &target, Some(&previous), BlockAction::Close);

        assert_eq!(overlay_choice(&spike, OverlayChoice::Return), Ok(()));

        assert_eq!(
            calls(&log),
            [
                Call::HideOrClose(10, BlockAction::Close),
                Call::HideOverlay,
                Call::Activate(20),
            ]
        );
        assert_overlay_closed(&spike, &target);
    }

    #[test]
    fn hide_overlay_failure_still_closes_gate() {
        let target = app(Some("com.x.game"), "Game", 10);
        let failing = Failing {
            hide_overlay: true,
            ..Failing::default()
        };
        for choice in [
            OverlayChoice::Return,
            OverlayChoice::Continue { reason: None },
        ] {
            let (spike, _) = spike_failing(vec![target.clone()], failing, OWN);
            open_overlay(&spike, &target, None, BlockAction::Hide);

            assert!(
                matches!(
                    overlay_choice(&spike, choice.clone()),
                    Err(SpikeError::Platform(_))
                ),
                "{choice:?}"
            );
            let state = spike.state();
            assert_eq!(state.target, None, "{choice:?}");
            assert_eq!(state.pending_show, None, "{choice:?}");
        }
    }

    #[test]
    fn return_when_activate_previous_fails_shows_main() {
        let target = app(Some("com.x.game"), "Game", 10);
        let previous = app(Some("com.x.editor"), "Editor", 20);
        let failing = Failing {
            activate: true,
            ..Failing::default()
        };
        let (spike, log) = spike_failing(vec![target.clone(), previous.clone()], failing, OWN);
        open_overlay(&spike, &target, Some(&previous), BlockAction::Hide);

        assert_eq!(overlay_choice(&spike, OverlayChoice::Return), Ok(()));
        assert_eq!(
            calls(&log),
            [
                Call::HideOrClose(10, BlockAction::Hide),
                Call::HideOverlay,
                Call::Activate(20),
                Call::ShowMain,
            ]
        );
        assert_overlay_closed(&spike, &target);

        // When the main window fails too, the error is returned.
        let failing = Failing {
            activate: true,
            show_main: true,
            ..Failing::default()
        };
        let (spike, _) = spike_failing(vec![target.clone(), previous.clone()], failing, OWN);
        open_overlay(&spike, &target, Some(&previous), BlockAction::Hide);
        assert!(matches!(
            overlay_choice(&spike, OverlayChoice::Return),
            Err(SpikeError::Platform(_))
        ));
    }

    #[test]
    fn ready_reemits_pending_show() {
        let (spike, log) = spike_with(Vec::new());
        overlay_ready(&spike).unwrap();
        assert_eq!(calls(&log), []);

        let target = app(Some("com.x.game"), "Game", 10);
        open_overlay(&spike, &target, None, BlockAction::Hide);
        overlay_ready(&spike).unwrap();
        assert_eq!(
            calls(&log),
            [Call::ShowOverlay(OverlayShow {
                app_name: "Game".into()
            })]
        );
    }
}
