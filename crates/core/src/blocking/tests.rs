use super::*;

const OWN: &str = "com.veloud.orasenda";

fn app(id: Option<&str>, pid: i32) -> AppRef {
    AppRef {
        bundle_id: id.map(str::to_owned),
        name: "App".into(),
        pid,
    }
}

fn rule(targets: &[&str]) -> BlockRule {
    BlockRule {
        targets: targets.iter().map(|s| (*s).to_owned()).collect(),
        action: BlockAction::Hide,
    }
}

#[test]
fn decide_target_intercepts() {
    let r = rule(&["com.x.a"]);
    assert_eq!(
        decide(&app(Some("com.x.a"), 1), &r, OWN, &[]),
        Decision::Intercept
    );
}

#[test]
fn decide_non_target_allows() {
    let r = rule(&["com.x.a"]);
    assert_eq!(
        decide(&app(Some("com.x.b"), 1), &r, OWN, &[]),
        Decision::Allow
    );
}

#[test]
fn decide_allowlist_never_intercepts() {
    for id in SAFETY_ALLOWLIST {
        let r = rule(&[id]);
        assert_eq!(
            decide(&app(Some(id), 1), &r, "other.own", &[]),
            Decision::Allow,
            "{id}"
        );
    }
}

#[test]
fn decide_own_bundle_allows() {
    let r = rule(&["com.x.me"]);
    assert_eq!(
        decide(&app(Some("com.x.me"), 1), &r, "com.x.me", &[]),
        Decision::Allow
    );
}

#[test]
fn decide_missing_bundle_allows() {
    assert_eq!(
        decide(&app(None, 1), &rule(&["a"]), OWN, &[]),
        Decision::Allow
    );
}

#[test]
fn decide_extra_allow_allows() {
    let r = rule(&["com.x.a"]);
    let extra = vec!["com.x.a".to_owned()];
    assert_eq!(
        decide(&app(Some("com.x.a"), 1), &r, OWN, &extra),
        Decision::Allow
    );
}

#[test]
fn decide_empty_rule_allows() {
    let r = BlockRule::default();
    assert!(r.targets.is_empty());
    assert_eq!(
        decide(&app(Some("com.x.a"), 1), &r, OWN, &[]),
        Decision::Allow
    );
}

fn gate() -> Gate {
    Gate::new(OWN.to_owned())
}

#[test]
fn gate_continue_suppresses_same_app() {
    let mut g = gate();
    let a = app(Some("com.x.a"), 1);
    g.allow("com.x.a");
    assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Ignore);
    assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Ignore);
}

#[test]
fn gate_other_countable_app_resets_allowance() {
    let mut g = gate();
    let a = app(Some("com.x.a"), 1);
    g.allow("com.x.a");
    assert_eq!(
        g.on_foreground(&app(Some("com.x.b"), 2), Decision::Allow),
        GateAction::Ignore
    );
    assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Show);
}

#[test]
fn gate_self_allowlisted_or_unbundled_do_not_reset() {
    let mut g = gate();
    let a = app(Some("com.x.a"), 1);
    g.allow("com.x.a");
    for other in [
        app(Some(OWN), 9),
        app(Some("com.apple.dock"), 8),
        app(None, 7),
    ] {
        g.on_foreground(&other, Decision::Allow);
        assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Ignore);
    }
}

#[test]
fn gate_rule_change_for_allowed_app_ends_allowance() {
    // #57: Continue, go to Orasenda, untick then tick the app, back to it -> overlay.
    let mut g = gate();
    let a = app(Some("com.x.a"), 1);
    let ticked = rule(&["com.x.a"]);
    let unticked = rule(&[]);
    g.allow("com.x.a");
    assert_eq!(
        g.on_foreground(&app(Some(OWN), 9), Decision::Allow),
        GateAction::Ignore
    );
    g.rule_changed(&ticked, &unticked);
    g.rule_changed(&unticked, &ticked);
    assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Show);
}

#[test]
fn gate_rule_change_for_other_app_keeps_allowance() {
    let mut g = gate();
    let a = app(Some("com.x.a"), 1);
    g.allow("com.x.a");
    g.on_foreground(&app(Some(OWN), 9), Decision::Allow);
    g.rule_changed(&rule(&["com.x.a"]), &rule(&["com.x.a", "com.x.b"]));
    assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Ignore);
}

#[test]
fn gate_identical_rule_keeps_allowance() {
    let mut g = gate();
    let a = app(Some("com.x.a"), 1);
    g.allow("com.x.a");
    g.rule_changed(&rule(&["com.x.a"]), &rule(&["com.x.a"]));
    assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Ignore);
}

#[test]
fn gate_action_change_keeps_allowance() {
    let mut g = gate();
    let a = app(Some("com.x.a"), 1);
    let close = BlockRule {
        action: BlockAction::Close,
        ..rule(&["com.x.a"])
    };
    g.allow("com.x.a");
    g.rule_changed(&rule(&["com.x.a"]), &close);
    assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Ignore);
}

#[test]
fn gate_adding_the_allowed_app_ends_allowance() {
    // Continue after the app was unticked while its overlay was open, then ticked again.
    let mut g = gate();
    let a = app(Some("com.x.a"), 1);
    g.allow("com.x.a");
    g.rule_changed(&rule(&[]), &rule(&["com.x.a"]));
    assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Show);
}

#[test]
fn gate_rule_change_keeps_open_overlay() {
    let mut g = gate();
    g.overlay_open("com.x.a");
    g.rule_changed(&rule(&["com.x.a"]), &rule(&[]));
    assert_eq!(
        g.on_foreground(&app(Some("com.x.a"), 1), Decision::Allow),
        GateAction::Ignore
    );
    assert_eq!(
        g.on_foreground(&app(Some(OWN), 9), Decision::Allow),
        GateAction::Ignore
    );
}

#[test]
fn gate_open_overlay_ignores_repeat() {
    let mut g = gate();
    let a = app(Some("com.x.a"), 1);
    assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Show);
    g.overlay_open("com.x.a");
    assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Ignore);
    assert_eq!(
        g.on_foreground(&app(Some(OWN), 9), Decision::Allow),
        GateAction::Ignore
    );
}

#[test]
fn gate_countable_app_while_open_closes_overlay() {
    let mut g = gate();
    g.overlay_open("com.x.a");
    assert_eq!(
        g.on_foreground(&app(Some("com.x.b"), 2), Decision::Allow),
        GateAction::CloseOverlay
    );
}

#[test]
fn gate_other_target_while_open_retargets() {
    let mut g = gate();
    g.overlay_open("com.x.a");
    let b = app(Some("com.x.b"), 2);
    assert_eq!(g.on_foreground(&b, Decision::Intercept), GateAction::Show);
    g.overlay_open("com.x.b");
    assert_eq!(g.on_foreground(&b, Decision::Intercept), GateAction::Ignore);
    assert_eq!(
        g.on_foreground(&app(Some("com.x.c"), 3), Decision::Allow),
        GateAction::CloseOverlay
    );
}

#[test]
// Also covers the choice-after-close path for Back to focus.
fn gate_overlay_closed_reenables() {
    let mut g = gate();
    let a = app(Some("com.x.a"), 1);
    g.overlay_open("com.x.a");
    g.overlay_closed();
    assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Show);
}

#[test]
fn gate_open_overlay_allowed_app_forward_closes_and_keeps_allowance() {
    let mut g = gate();
    let b = app(Some("com.x.b"), 2);
    g.allow("com.x.b");
    g.overlay_open("com.x.a");
    assert_eq!(
        g.on_foreground(&b, Decision::Intercept),
        GateAction::CloseOverlay
    );
    g.overlay_closed();
    assert_eq!(g.on_foreground(&b, Decision::Intercept), GateAction::Ignore);
}

#[test]
fn gate_open_overlay_other_countable_app_resets_allowance() {
    let mut g = gate();
    let b = app(Some("com.x.b"), 2);
    g.allow("com.x.b");
    g.overlay_open("com.x.a");
    assert_eq!(
        g.on_foreground(&app(Some("com.x.c"), 3), Decision::Allow),
        GateAction::CloseOverlay
    );
    g.overlay_closed();
    assert_eq!(g.on_foreground(&b, Decision::Intercept), GateAction::Show);
}

#[test]
fn gate_choice_after_close_continue_ignores() {
    let mut g = gate();
    let a = app(Some("com.x.a"), 1);
    g.overlay_open("com.x.a");
    g.allow("com.x.a");
    g.overlay_closed();
    assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Ignore);
}

#[test]
fn decide_own_bundle_not_on_allowlist_is_allowed_by_own_id() {
    assert!(!SAFETY_ALLOWLIST.contains(&"com.veloud.orasenda"));
    let own = "com.veloud.orasenda.dev";
    let r = rule(&[own]);
    assert_eq!(decide(&app(Some(own), 1), &r, own, &[]), Decision::Allow);
    let mut g = Gate::new(own.to_owned());
    let a = app(Some("com.x.a"), 1);
    g.allow("com.x.a");
    assert_eq!(
        g.on_foreground(&app(Some(own), 9), Decision::Allow),
        GateAction::Ignore
    );
    assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Ignore);
}

#[test]
fn block_action_serializes_lowercase() {
    assert_eq!(serde_json::to_value(BlockAction::Hide).unwrap(), "hide");
    assert_eq!(serde_json::to_value(BlockAction::Close).unwrap(), "close");
}

#[test]
fn app_ref_serializes_camel_case() {
    let v = serde_json::to_value(app(Some("com.x.a"), 4)).unwrap();
    assert_eq!(v["bundleId"], "com.x.a");
    assert_eq!(v["pid"], 4);
    assert!(v.get("bundle_id").is_none());
}
