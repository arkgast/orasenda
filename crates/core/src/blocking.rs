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
    ///
    /// Both directions count. Removal: the user unticked and re-ticked the app (#57).
    /// Addition: the app can be allowed while untargeted (unticked while its overlay was
    /// open, then *Continue*), and ticking it is a fresh decision to block it. Changes that
    /// leave the app's entry alone (other apps, Hide/Close) keep the allowance.
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

    /// The app's bundle ID when it counts as a real switch: bundled, not Orasenda and not
    /// on the safety allowlist. Only a countable app can end an allowance or close the
    /// overlay; the spike also records only countable apps as the *Back to focus*
    /// destination. `extra_allow` apps (Phone) are countable.
    pub fn countable<'a>(&self, app: &'a AppRef) -> Option<&'a str> {
        let id = app.bundle_id.as_deref()?;
        (id != self.own_bundle_id && !SAFETY_ALLOWLIST.contains(&id)).then_some(id)
    }

    /// Decides what to do when `app` comes to the foreground; `decision` is [`decide`]'s
    /// verdict for it. Only a countable app (bundled, not Orasenda, not on the safety
    /// allowlist) can end an allowance or close an overlay.
    ///
    /// Phase 1, overlay open (see [`Gate::overlay_open`]):
    /// - the overlay's own target, Orasenda, an allowlisted or unbundled app: `Ignore`;
    /// - another countable app that is intercepted and not allowed: `Show` (retarget);
    /// - any other countable app: `CloseOverlay`;
    /// - in both countable cases the allowance survives only if this app is the allowed
    ///   one; otherwise it is reset.
    ///
    /// Phase 2, overlay closed:
    /// - a countable app other than the allowed one resets the allowance;
    /// - an intercepted app that is not allowed: `Show`;
    /// - anything else, including the allowed app: `Ignore`.
    ///
    /// Caller meaning: `Show` opens (or retargets) the overlay and then calls
    /// [`Gate::overlay_open`]; `Ignore` does nothing; `CloseOverlay` closes it and then calls
    /// [`Gate::overlay_closed`].
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
mod tests;
