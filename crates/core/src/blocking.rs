//! Block decisions: which foreground apps to intercept, and the *Continue* allowance.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use specta::Type;

/// A running app as the OS reports it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppRef {
    pub bundle_id: Option<String>,
    pub name: String,
    pub pid: i32,
}

/// What to do to an intercepted app, serialized lowercase.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum BlockAction {
    Hide,
    Close,
}

/// Which apps (by bundle ID) to intercept, and how.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BlockRule {
    pub targets: BTreeSet<String>,
    pub action: BlockAction,
}

impl Default for BlockRule {
    fn default() -> Self {
        BlockRule {
            targets: BTreeSet::new(),
            action: BlockAction::Hide,
        }
    }
}

/// Outcome of [`decide`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    Allow,
    Intercept,
}

/// Bundle IDs that are never intercepted.
pub const SAFETY_ALLOWLIST: &[&str] = &[
    "com.apple.FaceTime",
    "com.apple.MobileSMS",
    "com.apple.systempreferences",
    "com.apple.VoiceOverUtility",
    "com.apple.loginwindow",
    "com.apple.accessibility.AccessibilityInspector",
    "com.apple.dock",
    "com.veloud.orasenda",
];

/// `Intercept` only for an app with a bundle ID that is a target and is neither Orasenda
/// itself, on the safety allowlist nor in `extra_allow`.
pub fn decide(
    app: &AppRef,
    rule: &BlockRule,
    own_bundle_id: &str,
    extra_allow: &[String],
) -> Decision {
    let Some(id) = app.bundle_id.as_deref() else {
        return Decision::Allow;
    };
    if id == own_bundle_id
        || SAFETY_ALLOWLIST.contains(&id)
        || extra_allow.iter().any(|a| a == id)
        || !rule.targets.contains(id)
    {
        return Decision::Allow;
    }
    Decision::Intercept
}

/// What the caller should do after a foreground change.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GateAction {
    Show,
    Ignore,
    CloseOverlay,
}

/// Tracks the *Continue* allowance and the open overlay.
#[derive(Debug, Clone)]
pub struct Gate {
    own_bundle_id: String,
    allowed: Option<String>,
    open_for: Option<String>,
}

impl Gate {
    pub fn new(own_bundle_id: String) -> Gate {
        Gate {
            own_bundle_id,
            allowed: None,
            open_for: None,
        }
    }

    /// Remembers that the user chose *Continue* for this app.
    pub fn allow(&mut self, bundle_id: &str) {
        self.allowed = Some(bundle_id.to_owned());
    }

    /// The rule changed from `old` to `new`: if the app allowed by *Continue* was added to or
    /// removed from the targets, its allowance ends. The open overlay is left alone.
    pub fn rule_changed(&mut self, old: &BlockRule, new: &BlockRule) {
        if self
            .allowed
            .as_deref()
            .is_some_and(|id| old.targets.contains(id) != new.targets.contains(id))
        {
            self.allowed = None;
        }
    }

    /// Records that the overlay is showing for this app.
    pub fn overlay_open(&mut self, bundle_id: &str) {
        self.open_for = Some(bundle_id.to_owned());
    }

    /// Records that the overlay is gone.
    pub fn overlay_closed(&mut self) {
        self.open_for = None;
    }

    fn countable<'a>(&self, app: &'a AppRef) -> Option<&'a str> {
        let id = app.bundle_id.as_deref()?;
        (id != self.own_bundle_id && !SAFETY_ALLOWLIST.contains(&id)).then_some(id)
    }

    pub fn on_foreground(&mut self, app: &AppRef, decision: Decision) -> GateAction {
        let countable = self.countable(app);
        if let Some(target) = self.open_for.as_deref() {
            return match countable {
                Some(id) if id != target => {
                    let still_allowed = self.allowed.as_deref() == Some(id);
                    if !still_allowed {
                        self.allowed = None;
                    }
                    if decision == Decision::Intercept && !still_allowed {
                        GateAction::Show
                    } else {
                        GateAction::CloseOverlay
                    }
                }
                _ => GateAction::Ignore,
            };
        }
        if countable.is_some_and(|id| self.allowed.as_deref().is_some_and(|a| a != id)) {
            self.allowed = None;
        }
        match (decision, app.bundle_id.as_deref(), self.allowed.as_deref()) {
            (Decision::Intercept, Some(id), Some(allowed)) if id == allowed => GateAction::Ignore,
            (Decision::Intercept, ..) => GateAction::Show,
            _ => GateAction::Ignore,
        }
    }
}

#[cfg(test)]
mod tests {
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
        g.rule_changed(&rule(&["com.x.a"]), &rule(&["com.x.a"]));
        assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Ignore);
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
    fn gate_overlay_closed_reenables() {
        let mut g = gate();
        let a = app(Some("com.x.a"), 1);
        g.overlay_open("com.x.a");
        g.overlay_closed();
        assert_eq!(g.on_foreground(&a, Decision::Intercept), GateAction::Show);
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
}
