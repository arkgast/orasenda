//! The keyboard service: accelerators, register-before-save and the ⌃⌥F entry. Also the
//! [`FakeRegistrar`], a registrar that can fail, for the app crate's tests.

use std::sync::{Mutex, PoisonError};

use super::*;

/// A registry view without a host: the defaults, with the saved text of some slots replaced
/// (`None` empties one). An *Everywhere* slot with keys shows `Registered`, an empty one `Off`.
pub fn keyboard_view(set: &[(ActionId, Slot, Option<&str>)]) -> crate::api::KeyboardView {
    use super::view::{Rows, effective, view_from};
    let mut rows = Rows::new();
    for (id, slot, keys) in set {
        let text = keys.map_or_else(|| "off".to_string(), str::to_string);
        rows.insert((*id, *slot), (Some(text), false));
    }
    let statuses: Vec<_> = ActionId::ALL
        .iter()
        .map(|id| {
            if effective(&rows, *id, Slot::Global).is_some() {
                crate::api::ShortcutStatus::Registered
            } else {
                crate::api::ShortcutStatus::Off
            }
        })
        .collect();
    view_from(&rows, &statuses, true, false)
}

/// `view` with one *Everywhere* status replaced.
pub fn with_status(
    mut view: crate::api::KeyboardView,
    id: ActionId,
    status: crate::api::ShortcutStatus,
) -> crate::api::KeyboardView {
    if let Some(action) = view.actions.iter_mut().find(|a| a.id == id) {
        action.global.status = status;
    }
    view
}

type Probe = Box<dyn Fn() -> String + Send + Sync>;

/// A [`ShortcutRegistrar`] that records every call, fails on demand, and can read the stored
/// setting at each call to show what was saved by then.
#[derive(Default)]
pub struct FakeRegistrar {
    calls: Mutex<Vec<String>>,
    live: Mutex<Vec<(ActionId, String)>>,
    failing: Mutex<bool>,
    probe: Mutex<Option<Probe>>,
    probed: Mutex<Vec<String>>,
}

impl FakeRegistrar {
    /// Makes every `register` fail (or succeed again).
    pub fn set_failing(&self, failing: bool) {
        *self.failing.lock().unwrap_or_else(PoisonError::into_inner) = failing;
    }

    /// Reads `probe` at every call and keeps the answers in [`FakeRegistrar::probed`].
    pub fn set_probe(&self, probe: Probe) {
        *self.probe.lock().unwrap_or_else(PoisonError::into_inner) = Some(probe);
    }

    pub fn calls(&self) -> Vec<String> {
        self.calls
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    pub fn probed(&self) -> Vec<String> {
        self.probed
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    /// The accelerators registered for `id`, oldest first.
    pub fn live(&self, id: ActionId) -> Vec<String> {
        let live = self.live.lock().unwrap_or_else(PoisonError::into_inner);
        live.iter()
            .filter(|(i, _)| *i == id)
            .map(|(_, a)| a.clone())
            .collect()
    }

    fn note(&self, call: String) {
        if let Some(probe) = self
            .probe
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .as_ref()
        {
            let seen = probe();
            self.probed
                .lock()
                .unwrap_or_else(PoisonError::into_inner)
                .push(seen);
        }
        self.calls
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push(call);
    }
}

impl ShortcutRegistrar for FakeRegistrar {
    fn register(&self, id: ActionId, acc: &Accelerator) -> Result<(), RegisterError> {
        self.note(format!("register {id:?} {}", acc.canonical()));
        if *self.failing.lock().unwrap_or_else(PoisonError::into_inner) {
            return Err(RegisterError::new("another app holds it"));
        }
        self.live
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .push((id, acc.canonical()));
        Ok(())
    }

    fn unregister(&self, id: ActionId) {
        self.note(format!("unregister {id:?}"));
        let mut live = self.live.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some(at) = live.iter().position(|(i, _)| *i == id) {
            live.remove(at);
        }
    }
}

#[cfg(test)]
#[path = "cases.rs"]
mod cases;

#[cfg(test)]
#[path = "cases_binding.rs"]
mod cases_binding;

#[cfg(test)]
#[path = "tip_cases.rs"]
mod tip_cases;
