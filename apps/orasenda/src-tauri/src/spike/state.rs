//! Spike state, held in Tauri managed state as one [`Spike`].

use std::sync::{Mutex, MutexGuard, OnceLock, PoisonError};

use orasenda_core::{AppRef, BlockRule, Gate, IDLE_THRESHOLD_MS, UsageTracker};

use super::{OverlayShow, SpikePlatform};

/// Everything the spike tracks, behind one `Mutex` (see [`Spike::state`]).
#[derive(Debug)]
pub struct SpikeState {
    pub rule: BlockRule,
    pub gate: Gate,
    pub tracker: UsageTracker,
    /// The app the overlay is showing for.
    pub target: Option<AppRef>,
    /// The last countable foreground app that was not itself intercepted; *Back to focus*
    /// lands here.
    pub previous: Option<AppRef>,
    /// The `overlay-show` for the open overlay, re-emitted when the overlay page is ready.
    /// Cleared when the overlay closes.
    pub pending_show: Option<OverlayShow>,
    /// Bundle IDs allowed on top of the safety allowlist (the Phone app, when present).
    pub extra_allow: Vec<String>,
}

impl SpikeState {
    pub fn new(own_bundle_id: &str) -> SpikeState {
        SpikeState {
            rule: BlockRule::default(),
            gate: Gate::new(own_bundle_id.to_owned()),
            tracker: UsageTracker::new(IDLE_THRESHOLD_MS),
            target: None,
            previous: None,
            pending_show: None,
            extra_allow: Vec::new(),
        }
    }
}

/// The managed spike: the flag, the state and the installed platform, if any.
pub struct Spike {
    enabled: bool,
    own_bundle_id: String,
    state: Mutex<SpikeState>,
    platform: OnceLock<Box<dyn SpikePlatform>>,
}

/// Returned by [`Spike::install`] when the spike is disabled or a platform is already set.
#[derive(Debug, PartialEq, Eq)]
pub struct NotInstalled;

impl Spike {
    pub fn new(enabled: bool, own_bundle_id: &str) -> Spike {
        Spike {
            enabled,
            own_bundle_id: own_bundle_id.to_owned(),
            state: Mutex::new(SpikeState::new(own_bundle_id)),
            platform: OnceLock::new(),
        }
    }

    pub fn enabled(&self) -> bool {
        self.enabled
    }

    pub fn own_bundle_id(&self) -> &str {
        &self.own_bundle_id
    }

    /// Locks the state. Never hold the guard while calling a [`SpikePlatform`] method.
    pub fn state(&self) -> MutexGuard<'_, SpikeState> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Installs the platform once. Refused when the spike is disabled.
    pub fn install(&self, platform: Box<dyn SpikePlatform>) -> Result<(), NotInstalled> {
        if !self.enabled {
            return Err(NotInstalled);
        }
        self.platform.set(platform).map_err(|_| NotInstalled)
    }

    pub fn platform(&self) -> Option<&dyn SpikePlatform> {
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
