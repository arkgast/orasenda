//! Spike state, held in Tauri managed state as one [`Spike`].

use std::sync::{Mutex, MutexGuard, OnceLock, PoisonError};

use orasenda_core::{
    AppRef, BlockRule, Decision, Gate, GateAction, IDLE_THRESHOLD_MS, UsageTracker, decide,
};

use super::{OverlayShow, SpikePlatform};

/// What the foreground sink does once the state lock is released.
#[cfg_attr(
    not(any(test, target_os = "macos")),
    expect(dead_code, reason = "built by the macOS wiring (#16)")
)]
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Step {
    /// Show the overlay with this `overlay-show`, or re-target the visible one.
    Show(OverlayShow),
    /// Hide the overlay, then [`SpikeState::close_overlay`].
    Close,
}

/// Everything the spike tracks, behind one `Mutex` (see [`Spike::state`]).
///
/// The open overlay (its target, the gate's open target and the pending `overlay-show`)
/// changes only through [`SpikeState::open_overlay`] and [`SpikeState::close_overlay`], so
/// the three never drift apart.
#[derive(Debug)]
pub(crate) struct SpikeState {
    rule: BlockRule,
    /// Written directly by the idle sampler and the usage tests: it has no invariant to
    /// protect.
    pub(crate) tracker: UsageTracker,
    /// The last countable foreground app that was not itself intercepted; *Back to focus*
    /// lands here.
    previous: Option<AppRef>,
    /// Bundle IDs allowed on top of the safety allowlist (the Phone app, when present).
    extra_allow: Vec<String>,
    gate: Gate,
    /// The app the open overlay is showing for.
    target: Option<AppRef>,
}

impl SpikeState {
    pub(crate) fn new(own_bundle_id: &str) -> SpikeState {
        SpikeState {
            rule: BlockRule::default(),
            tracker: UsageTracker::new(IDLE_THRESHOLD_MS),
            previous: None,
            extra_allow: Vec::new(),
            gate: Gate::new(own_bundle_id.to_owned()),
            target: None,
        }
    }

    /// A foreground change at `now_ms`, in this order: track it, [`decide`], update
    /// `previous`, ask the gate, then open (or re-target) the overlay. Returns what the
    /// caller does once the lock is released.
    ///
    /// `previous` becomes `front` when the gate counts it ([`Gate::countable`]: bundled, not
    /// Orasenda, not on the safety allowlist) and it was not intercepted. `extra_allow` apps
    /// (Phone) count: `decide` already lets them through.
    #[cfg_attr(
        not(any(test, target_os = "macos")),
        expect(dead_code, reason = "called by the macOS wiring (#16)")
    )]
    pub(crate) fn on_foreground(&mut self, front: AppRef, own: &str, now_ms: u64) -> Option<Step> {
        self.tracker.on_foreground(&front, now_ms);
        let decision = decide(&front, &self.rule, own, &self.extra_allow);
        if decision == Decision::Allow && self.gate.countable(&front).is_some() {
            self.previous = Some(front.clone());
        }
        match self.gate_on_foreground(&front, decision) {
            GateAction::Show => self.open_overlay(front).map(Step::Show),
            GateAction::CloseOverlay => Some(Step::Close),
            GateAction::Ignore => None,
        }
    }

    /// The app with this pid quit. `previous` is forgotten when it was that app. Returns
    /// whether it was the overlay's target; the caller then closes the overlay.
    #[cfg_attr(
        not(any(test, target_os = "macos")),
        expect(dead_code, reason = "called by the macOS wiring (#16)")
    )]
    pub(crate) fn app_terminated(&mut self, pid: i32) -> bool {
        if self
            .previous
            .as_ref()
            .is_some_and(|previous| previous.pid == pid)
        {
            self.previous = None;
        }
        self.target.as_ref().is_some_and(|target| target.pid == pid)
    }

    pub(crate) fn rule(&self) -> &BlockRule {
        &self.rule
    }

    /// The last countable foreground app that was not itself intercepted.
    pub(crate) fn previous(&self) -> Option<&AppRef> {
        self.previous.as_ref()
    }

    /// Bundle IDs allowed on top of the safety allowlist.
    pub(crate) fn extra_allow(&self) -> &[String] {
        &self.extra_allow
    }

    /// Replaces the bundle IDs allowed on top of the safety allowlist.
    #[cfg_attr(
        not(any(test, target_os = "macos")),
        expect(dead_code, reason = "called by the macOS wiring (#16)")
    )]
    pub(crate) fn set_extra_allow(&mut self, extra_allow: Vec<String>) {
        self.extra_allow = extra_allow;
    }

    /// What to do after a foreground change ([`Gate::on_foreground`]).
    #[cfg_attr(
        not(any(test, target_os = "macos")),
        expect(dead_code, reason = "called by the macOS wiring (#16)")
    )]
    pub(crate) fn gate_on_foreground(&mut self, app: &AppRef, decision: Decision) -> GateAction {
        self.gate.on_foreground(app, decision)
    }

    /// Replaces the rule. Adding or removing the app allowed by *Continue* ends its
    /// allowance ([`Gate::rule_changed`]); the open overlay stays.
    pub(crate) fn set_rule(&mut self, rule: BlockRule) {
        self.gate.rule_changed(&self.rule, &rule);
        self.rule = rule;
    }

    /// Opens the overlay for `target`, or re-targets the open one, and returns the
    /// `overlay-show` to emit. `previous` is left unchanged. A target without a bundle ID is
    /// never intercepted, so it is refused: nothing changes and `None` is returned.
    #[cfg_attr(
        not(any(test, target_os = "macos")),
        expect(dead_code, reason = "called by the macOS wiring (#16)")
    )]
    pub(crate) fn open_overlay(&mut self, target: AppRef) -> Option<OverlayShow> {
        self.gate.overlay_open(target.bundle_id.as_deref()?);
        let show = OverlayShow {
            app_name: target.name.clone(),
        };
        self.target = Some(target);
        Some(show)
    }

    /// Forgets the open overlay: the gate re-enables and nothing is pending.
    pub(crate) fn close_overlay(&mut self) {
        self.gate.overlay_closed();
        self.target = None;
    }

    /// *Continue*: allows the target until another countable app comes to the front, and
    /// returns it.
    pub(crate) fn allow_target(&mut self) -> Option<AppRef> {
        let target = self.target.clone()?;
        if let Some(id) = target.bundle_id.as_deref() {
            self.gate.allow(id);
        }
        Some(target)
    }

    /// The app the open overlay is showing for.
    pub(crate) fn target(&self) -> Option<&AppRef> {
        self.target.as_ref()
    }

    /// The `overlay-show` for the open overlay, re-emitted when the overlay page is ready;
    /// `None` once it closes.
    pub(crate) fn pending_show(&self) -> Option<OverlayShow> {
        self.target.as_ref().map(|target| OverlayShow {
            app_name: target.name.clone(),
        })
    }
}

/// The managed spike: the flag, the state and the installed platform, if any.
pub(crate) struct Spike {
    enabled: bool,
    own_bundle_id: String,
    state: Mutex<SpikeState>,
    platform: OnceLock<Box<dyn SpikePlatform>>,
}

/// Why [`Spike::install`] refused a platform.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum InstallError {
    /// The spike is disabled: no platform is ever installed.
    Disabled,
    /// A platform is already installed.
    AlreadyInstalled,
}

impl Spike {
    pub(crate) fn new(enabled: bool, own_bundle_id: &str) -> Spike {
        Spike {
            enabled,
            own_bundle_id: own_bundle_id.to_owned(),
            state: Mutex::new(SpikeState::new(own_bundle_id)),
            platform: OnceLock::new(),
        }
    }

    pub(crate) fn enabled(&self) -> bool {
        self.enabled
    }

    pub(crate) fn own_bundle_id(&self) -> &str {
        &self.own_bundle_id
    }

    /// Locks the state. Never hold the guard while calling a [`SpikePlatform`] method.
    pub(crate) fn state(&self) -> MutexGuard<'_, SpikeState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Installs the platform once. Refused when the spike is disabled.
    #[cfg_attr(
        not(any(test, target_os = "macos")),
        expect(dead_code, reason = "called by the macOS wiring (#16)")
    )]
    pub(crate) fn install(&self, platform: Box<dyn SpikePlatform>) -> Result<(), InstallError> {
        if !self.enabled {
            return Err(InstallError::Disabled);
        }
        self.platform
            .set(platform)
            .map_err(|_| InstallError::AlreadyInstalled)
    }

    pub(crate) fn platform(&self) -> Option<&dyn SpikePlatform> {
        self.platform.get().map(|platform| platform.as_ref())
    }

    /// Whether the state lock is held right now (tests check that no platform call holds it).
    #[cfg(test)]
    pub(crate) fn is_locked(&self) -> bool {
        matches!(
            self.state.try_lock(),
            Err(std::sync::TryLockError::WouldBlock)
        )
    }
}

#[cfg(test)]
mod tests;
