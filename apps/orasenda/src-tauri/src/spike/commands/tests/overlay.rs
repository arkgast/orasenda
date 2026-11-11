use super::*;
use crate::spike::commands::overlay::hide_or_close_failure;

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
    spike
        .state()
        .set_extra_allow(vec!["com.apple.mobilephone".into()]);
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
    assert_eq!(spike.state().rule(), &rule);

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
    assert_eq!(state.target(), None);
    assert_eq!(state.pending_show(), None);
    // The gate is closed: the target shows the overlay again.
    assert_eq!(
        state.gate_on_foreground(&target, Decision::Intercept),
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
            Call::Activate(20),
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
fn continue_when_activate_fails_returns_the_error() {
    let target = app(Some("com.x.game"), "Game", 10);
    let failing = Failing {
        activate: true,
        ..Failing::default()
    };
    let (spike, log) = spike_failing(vec![target.clone()], failing, OWN);
    open_overlay(&spike, &target, None, BlockAction::Hide);

    assert_eq!(
        overlay_choice(&spike, OverlayChoice::Continue { reason: None }),
        Err(SpikeError::Platform(PlatformError::Refused))
    );
    assert_eq!(calls(&log), [Call::HideOverlay, Call::Activate(10)]);
}

#[test]
fn hide_refused_is_logged_as_unreliable_other_failures_keep_their_wording() {
    assert_eq!(
        hide_or_close_failure("Ghostty", BlockAction::Hide, &PlatformError::Refused),
        "spike: hide returned NO for Ghostty (unreliable on macOS 27; see docs/common-issues.md)"
    );
    assert_eq!(
        hide_or_close_failure("Ghostty", BlockAction::Close, &PlatformError::Refused),
        "spike: could not Close Ghostty: the OS refused the request"
    );
    assert_eq!(
        hide_or_close_failure("Ghostty", BlockAction::Hide, &PlatformError::NotFound),
        "spike: could not Hide Ghostty: app not found"
    );
    assert_eq!(
        hide_or_close_failure(
            "Agent",
            BlockAction::Hide,
            &PlatformError::Other("not a regular app".into())
        ),
        "spike: could not Hide Agent: not a regular app"
    );
}

#[test]
fn return_never_activates_an_app_the_rule_intercepts() {
    // `previous` was recorded before the rule changed: it is the target itself, or
    // another app that is now a target. Activating it unhides it and reopens the
    // overlay (#41), so Return lands in the main window instead.
    let target = app(Some("com.x.game"), "Game", 10);
    let other = app(Some("com.x.chat"), "Chat", 30);
    for previous in [target.clone(), other.clone()] {
        let (spike, log) = spike_with(vec![target.clone(), other.clone()]);
        open_overlay(&spike, &target, Some(&previous), BlockAction::Hide);
        let mut state = spike.state();
        let mut rule = state.rule().clone();
        rule.targets.extend(other.bundle_id.iter().cloned());
        state.set_rule(rule);
        drop(state);

        assert_eq!(overlay_choice(&spike, OverlayChoice::Return), Ok(()));

        assert_eq!(
            calls(&log),
            [
                Call::HideOrClose(10, BlockAction::Hide),
                Call::HideOverlay,
                Call::ShowMain,
            ],
            "previous {previous:?}"
        );
    }
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
    assert_eq!(state.target(), None);
    assert_eq!(state.pending_show(), None);
    // Allowed and closed: the target comes back without an overlay.
    assert_eq!(
        state.gate_on_foreground(&target, Decision::Intercept),
        GateAction::Ignore
    );
    // The reason is not kept anywhere in the state.
    assert!(!format!("{state:?}").contains("reply to a message"));
}

#[test]
fn re_ticking_the_allowed_app_ends_continue() {
    // #57: Continue to the target, go to Orasenda, untick and tick it again, back to it.
    let target = app(Some("com.x.game"), "Game", 10);
    let own = app(Some(OWN), "Orasenda", 1);
    let (spike, _log) = spike_with(vec![target.clone()]);
    open_overlay(&spike, &target, None, BlockAction::Hide);
    overlay_choice(&spike, OverlayChoice::Continue { reason: None }).unwrap();
    let ticked = spike.state().rule().clone();
    assert_eq!(
        spike.state().gate_on_foreground(&own, Decision::Allow),
        GateAction::Ignore
    );

    set_rule(&spike, BlockRule::default()).unwrap();
    set_rule(&spike, ticked).unwrap();

    assert_eq!(
        spike
            .state()
            .gate_on_foreground(&target, Decision::Intercept),
        GateAction::Show
    );
}

/// The gate is closed and nothing is pending for the overlay.
fn assert_overlay_closed(spike: &Spike, target: &AppRef) {
    let mut state = spike.state();
    assert_eq!(state.target(), None);
    assert_eq!(state.pending_show(), None);
    assert_eq!(
        state.gate_on_foreground(target, Decision::Intercept),
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

        assert_eq!(
            overlay_choice(&spike, choice.clone()),
            Err(SpikeError::Platform(PlatformError::Refused)),
            "{choice:?}"
        );
        let mut state = spike.state();
        assert_eq!(state.target(), None, "{choice:?}");
        assert_eq!(state.pending_show(), None, "{choice:?}");
        // The gate itself is closed: Return re-enables the target; Continue allows it,
        // and another target still shows.
        let expected = match choice {
            OverlayChoice::Return => GateAction::Show,
            OverlayChoice::Continue { .. } => GateAction::Ignore,
        };
        assert_eq!(
            state.gate_on_foreground(&target, Decision::Intercept),
            expected,
            "{choice:?}"
        );
        if let OverlayChoice::Continue { .. } = choice {
            let other = app(Some("com.x.other"), "Other", 11);
            assert_eq!(
                state.gate_on_foreground(&other, Decision::Intercept),
                GateAction::Show
            );
        }
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
    assert_eq!(
        overlay_choice(&spike, OverlayChoice::Return),
        Err(SpikeError::Platform(PlatformError::Refused))
    );
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
