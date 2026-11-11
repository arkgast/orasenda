use orasenda_core::{Decision, GateAction, SAFETY_ALLOWLIST};

use super::*;

const OWN: &str = "com.veloud.orasenda";

fn app(id: &str, name: &str, pid: i32) -> AppRef {
    AppRef {
        bundle_id: Some(id.to_owned()),
        name: name.to_owned(),
        pid,
    }
}

#[test]
fn retarget_and_close_keep_overlay_consistent() {
    let mut state = SpikeState::new(OWN);
    let a = app("com.x.a", "A", 1);
    let b = app("com.x.b", "B", 2);
    assert_eq!(state.pending_show(), None);

    let show = state.open_overlay(a.clone()).unwrap();
    assert_eq!(show.app_name, "A");
    assert_eq!(state.target(), Some(&a));
    assert_eq!(state.pending_show(), Some(show));

    // Re-target: B arrives while the overlay is open for A.
    assert_eq!(
        state.gate_on_foreground(&b, Decision::Intercept),
        GateAction::Show
    );
    let show = state.open_overlay(b.clone()).unwrap();
    assert_eq!(state.target(), Some(&b));
    assert_eq!(state.pending_show(), Some(show));
    assert_eq!(
        state.gate_on_foreground(&b, Decision::Intercept),
        GateAction::Ignore
    );

    state.close_overlay();
    assert_eq!(state.target(), None);
    assert_eq!(state.pending_show(), None);
    assert_eq!(
        state.gate_on_foreground(&b, Decision::Intercept),
        GateAction::Show
    );
}

#[test]
fn open_overlay_refuses_bundleless_target() {
    let mut state = SpikeState::new(OWN);
    let unbundled = AppRef {
        bundle_id: None,
        name: "tool".to_owned(),
        pid: 3,
    };
    assert_eq!(state.open_overlay(unbundled), None);
    assert_eq!(state.target(), None);
    assert_eq!(state.pending_show(), None);
}

fn targets(ids: &[&str]) -> BlockRule {
    BlockRule {
        targets: ids.iter().map(|id| (*id).to_owned()).collect(),
        ..BlockRule::default()
    }
}

fn show(name: &str) -> Option<Step> {
    Some(Step::Show(OverlayShow {
        app_name: name.to_owned(),
    }))
}

/// A state whose rule targets A and B, with Editor in front (so it is `previous`).
fn state_after_editor() -> (SpikeState, AppRef) {
    let mut state = SpikeState::new(OWN);
    state.set_rule(targets(&["com.x.a", "com.x.b"]));
    let editor = app("com.x.editor", "Editor", 10);
    assert_eq!(state.on_foreground(editor.clone(), OWN, 1_000), None);
    assert_eq!(state.previous(), Some(&editor));
    (state, editor)
}

#[test]
fn foreground_is_tracked_even_when_intercepted() {
    let (mut state, _) = state_after_editor();
    state.on_foreground(app("com.x.a", "A", 1), OWN, 5_000);
    let names: Vec<&str> = state
        .tracker
        .segments()
        .iter()
        .map(|segment| segment.name.as_str())
        .collect();
    assert_eq!(names, ["Editor", "A"]);
}

#[test]
fn intercepted_target_opens_overlay_and_leaves_previous() {
    let (mut state, editor) = state_after_editor();
    let a = app("com.x.a", "A", 1);
    assert_eq!(state.on_foreground(a.clone(), OWN, 2_000), show("A"));
    assert_eq!(state.target(), Some(&a));
    assert_eq!(state.previous(), Some(&editor));
    // The target again while its overlay is open: nothing to do.
    assert_eq!(state.on_foreground(a, OWN, 3_000), None);
    assert_eq!(state.previous(), Some(&editor));
}

#[test]
fn retarget_returns_show_and_leaves_previous() {
    let (mut state, editor) = state_after_editor();
    state.on_foreground(app("com.x.a", "A", 1), OWN, 2_000);
    let b = app("com.x.b", "B", 2);
    assert_eq!(state.on_foreground(b.clone(), OWN, 3_000), show("B"));
    assert_eq!(state.target(), Some(&b));
    assert_eq!(
        state.pending_show(),
        Some(OverlayShow {
            app_name: "B".into()
        })
    );
    assert_eq!(state.previous(), Some(&editor));
}

#[test]
fn own_activation_leaves_previous() {
    let (mut state, editor) = state_after_editor();
    let own = app(OWN, "Orasenda", 3);
    assert_eq!(state.on_foreground(own.clone(), OWN, 2_000), None);
    assert_eq!(state.previous(), Some(&editor));
    // Also while the overlay is open (it activates Orasenda's panel).
    state.on_foreground(app("com.x.a", "A", 1), OWN, 3_000);
    assert_eq!(state.on_foreground(own, OWN, 4_000), None);
    assert_eq!(state.previous(), Some(&editor));
}

#[test]
fn allowlisted_and_unbundled_apps_leave_previous() {
    let (mut state, editor) = state_after_editor();
    let allowlisted = app(SAFETY_ALLOWLIST[0], "Allowlisted", 4);
    let unbundled = AppRef {
        bundle_id: None,
        name: "tool".to_owned(),
        pid: 5,
    };
    for other in [allowlisted, unbundled] {
        assert_eq!(
            state.on_foreground(other.clone(), OWN, 2_000),
            None,
            "{other:?}"
        );
        assert_eq!(state.previous(), Some(&editor), "{other:?}");
    }
}

#[test]
fn countable_app_while_open_becomes_previous_and_closes() {
    let (mut state, _) = state_after_editor();
    state.on_foreground(app("com.x.a", "A", 1), OWN, 2_000);
    let browser = app("com.x.browser", "Browser", 6);
    assert_eq!(
        state.on_foreground(browser.clone(), OWN, 3_000),
        Some(Step::Close)
    );
    assert_eq!(state.previous(), Some(&browser));
}

#[test]
fn extra_allow_app_becomes_previous() {
    let (mut state, _) = state_after_editor();
    let phone = app("com.apple.mobilephone", "Phone", 7);
    state.set_rule(targets(&["com.x.a", "com.apple.mobilephone"]));
    state.set_extra_allow(vec!["com.apple.mobilephone".to_owned()]);
    assert_eq!(state.extra_allow(), ["com.apple.mobilephone"]);
    assert_eq!(state.on_foreground(phone.clone(), OWN, 2_000), None);
    assert_eq!(state.previous(), Some(&phone));
}

#[test]
fn app_terminated_reports_the_target_and_forgets_previous() {
    let (mut state, editor) = state_after_editor();
    let a = app("com.x.a", "A", 1);
    state.on_foreground(a.clone(), OWN, 2_000);

    // Another app quitting changes nothing.
    assert!(!state.app_terminated(99));
    assert_eq!(state.previous(), Some(&editor));
    assert_eq!(state.target(), Some(&a));

    // The previous app quitting: it is forgotten, the overlay stays.
    assert!(!state.app_terminated(editor.pid));
    assert_eq!(state.previous(), None);
    assert_eq!(state.target(), Some(&a));

    // The target quitting: reported, so the caller closes the overlay.
    assert!(state.app_terminated(a.pid));
}

#[test]
fn app_terminated_when_previous_is_the_target() {
    // #41 shape: X was previous, then the rule targeted X and its overlay opened.
    let mut state = SpikeState::new(OWN);
    let x = app("com.x.game", "Game", 8);
    assert_eq!(state.on_foreground(x.clone(), OWN, 1_000), None);
    assert_eq!(state.previous(), Some(&x));
    state.set_rule(targets(&["com.x.game"]));
    assert_eq!(state.on_foreground(x.clone(), OWN, 2_000), show("Game"));
    assert_eq!(state.target(), Some(&x));

    assert!(state.app_terminated(x.pid));
    assert_eq!(state.previous(), None);
}

/// A platform that does nothing.
struct Nothing;

impl SpikePlatform for Nothing {
    fn running_apps(&self) -> Vec<AppRef> {
        Vec::new()
    }
    fn hide_or_close(
        &self,
        _: i32,
        _: orasenda_core::BlockAction,
    ) -> Result<(), orasenda_core::PlatformError> {
        Ok(())
    }
    fn activate(&self, _: i32) -> Result<(), orasenda_core::PlatformError> {
        Ok(())
    }
    fn show_overlay(&self, _: OverlayShow) -> Result<(), orasenda_core::PlatformError> {
        Ok(())
    }
    fn hide_overlay(&self) -> Result<(), orasenda_core::PlatformError> {
        Ok(())
    }
    fn show_main(&self) -> Result<(), orasenda_core::PlatformError> {
        Ok(())
    }
}

#[test]
fn install_distinguishes_disabled_and_already_installed() {
    let disabled = Spike::new(false, OWN);
    assert_eq!(
        disabled.install(Box::new(Nothing)),
        Err(InstallError::Disabled)
    );
    assert!(disabled.platform().is_none());

    let enabled = Spike::new(true, OWN);
    assert_eq!(enabled.install(Box::new(Nothing)), Ok(()));
    assert_eq!(
        enabled.install(Box::new(Nothing)),
        Err(InstallError::AlreadyInstalled)
    );
}
