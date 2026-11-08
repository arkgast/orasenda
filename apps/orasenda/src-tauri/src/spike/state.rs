//! Spike state, held in Tauri managed state as one [`Spike`].

use std::sync::{Mutex, MutexGuard, OnceLock, PoisonError};

use orasenda_core::{
    AppRef, BlockRule, Decision, Gate, GateAction, IDLE_THRESHOLD_MS, UsageTracker,
};

use super::{OverlayShow, SpikePlatform};

/// Everything the spike tracks, behind one `Mutex` (see [`Spike::state`]).
///
/// The open overlay (its target, the gate's open target and the pending `overlay-show`)
/// changes only through [`SpikeState::open_overlay`] and [`SpikeState::close_overlay`], so
/// the three never drift apart.
#[derive(Debug)]
pub(crate) struct SpikeState {
    pub(crate) rule: BlockRule,
    pub(crate) tracker: UsageTracker,
    /// The last countable foreground app that was not itself intercepted; *Back to focus*
    /// lands here.
    pub(crate) previous: Option<AppRef>,
    /// Bundle IDs allowed on top of the safety allowlist (the Phone app, when present).
    pub(crate) extra_allow: Vec<String>,
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

    /// What to do after a foreground change ([`Gate::on_foreground`]).
    #[cfg_attr(
        not(any(test, target_os = "macos")),
        expect(dead_code, reason = "called by the macOS wiring (#16)")
    )]
    pub(crate) fn gate_on_foreground(&mut self, app: &AppRef, decision: Decision) -> GateAction {
        self.gate.on_foreground(app, decision)
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
mod tests {
    use orasenda_core::{Decision, GateAction};

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
}
