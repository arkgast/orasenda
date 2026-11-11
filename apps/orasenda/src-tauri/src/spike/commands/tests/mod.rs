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
        self.record(Call::Activate(pid))?;
        if self.running.iter().any(|app| app.pid == pid) {
            Ok(())
        } else {
            Err(PlatformError::NotFound)
        }
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
fn open_overlay(spike: &Spike, target: &AppRef, previous: Option<&AppRef>, action: BlockAction) {
    let mut state = spike.state();
    // `previous` comes forward before the rule targets anything, so it is recorded
    // even when it is the target itself.
    if let Some(previous) = previous {
        assert_eq!(state.on_foreground(previous.clone(), OWN, 0), None);
        assert_eq!(state.previous(), Some(previous));
    }
    state.set_rule(BlockRule {
        targets: target.bundle_id.iter().cloned().collect(),
        action,
    });
    state.open_overlay(target.clone());
}

mod gate;
mod overlay;
