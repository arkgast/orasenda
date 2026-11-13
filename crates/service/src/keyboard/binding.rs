//! Changing a binding (ADR-020): parse, slot rule, never-delivered keys, clash, warning,
//! register (*Everywhere* only, before saving, ADR-017), save, unregister the old keys, emit.

use super::conflicts::{self, Holder, OFF};
use super::registry::action;
use super::service::{Live, State, sync_tips, usable, view_of_state};
use super::system_keys::{never_delivered, well_known};
use super::view::{Rows, effective, read_rows};
use super::{Accelerator, ActionId, KeyboardService, ParseError, Slot};
use crate::api::{KeyboardError, KeyboardView, ShortcutStatus};
use crate::scheduler::{self, Host};
use crate::session::lock;

type Changed = Option<(u64, crate::api::TimerView)>;

/// The accelerator the person asked for, after the checks that need no store.
fn checked(slot: Slot, keys: &str) -> Result<Accelerator, KeyboardError> {
    let acc = Accelerator::parse(keys).map_err(|error| match error {
        ParseError::NeedsModifier => KeyboardError::NeedsModifier { slot },
        _ => KeyboardError::Invalid,
    })?;
    let [control, _alt, _shift, sup] = acc.modifiers();
    if slot == Slot::App && !(control || sup) {
        return Err(KeyboardError::NeedsModifier { slot });
    }
    if never_delivered(&acc).is_some() {
        return Err(KeyboardError::SystemKeeps);
    }
    Ok(acc)
}

impl KeyboardService {
    /// Changes a binding; `None` empties the slot. A refused change saves nothing and leaves the
    /// old binding as it was. `confirm_warning` goes ahead past a `Warning`.
    pub fn set_binding<H: Host>(
        &self,
        host: &H,
        id: ActionId,
        slot: Slot,
        keys: Option<String>,
        confirm_warning: bool,
    ) -> Result<KeyboardView, KeyboardError> {
        let wanted = keys.as_deref().map(|k| checked(slot, k)).transpose()?;
        let mut state = self.state();
        let rows = read_rows(host).map_err(|error| {
            eprintln!("keyboard: the saved keys could not be read ({error})");
            KeyboardError::Store
        })?;
        if let Some(acc) = &wanted {
            if let Some(holder) = clash(host, acc, id, slot)? {
                return Err(KeyboardError::InUse {
                    action: match holder {
                        Holder::Action(other, _) => action(other).label.into(),
                        Holder::Fixed(fixed) => fixed.label.into(),
                    },
                });
            }
            if slot == Slot::Global
                && !confirm_warning
                && let Some(reason) = well_known(acc)
            {
                return Err(KeyboardError::Warning {
                    reason: reason.into(),
                });
            }
        }
        let text = wanted
            .as_ref()
            .map_or_else(|| OFF.to_string(), Accelerator::canonical);
        let current = effective(&rows, id, slot);
        let unchanged =
            current.as_deref() == wanted.as_ref().map(Accelerator::canonical).as_deref();
        let live = slot == Slot::Global && state.slots[id.index()].live;
        let had_row =
            rows.get(&(id, slot)).and_then(|(row, _)| row.as_deref()) == Some(text.as_str());
        if unchanged && had_row && (slot == Slot::App || live || wanted.is_none()) {
            return Ok(view_of_state(host, &state, &rows));
        }
        let register = slot == Slot::Global && wanted.is_some() && !(unchanged && live);
        if register
            && let Some(acc) = &wanted
            && let Err(error) = self.registrar.register(id, acc)
        {
            eprintln!("keyboard: {id:?} {text} was not registered ({error})");
            return Err(KeyboardError::Unavailable);
        }
        // `old_live`: the saved keys are registered and stay so until the new ones are saved.
        let old_live = live && !unchanged;
        let (saved, changed) = save(host, id, slot, &text);
        if let Err(error) = saved {
            eprintln!("keyboard: {id:?} could not be saved ({error})");
            if register {
                self.roll_back(&mut state, id, &rows, old_live);
            }
            let now_usable = usable(&state);
            drop(state);
            sync_tips(host, now_usable);
            publish(host, changed);
            return Err(KeyboardError::Store);
        }
        if slot == Slot::Global {
            if old_live || (wanted.is_none() && live) {
                self.registrar.unregister(id);
            }
            state.slots[id.index()] = match wanted {
                Some(_) => Live {
                    live: true,
                    status: ShortcutStatus::Registered,
                },
                None => Live {
                    live: false,
                    status: ShortcutStatus::Off,
                },
            };
        }
        let rows = read_rows(host).unwrap_or(rows);
        let view = view_of_state(host, &state, &rows);
        let now_usable = usable(&state);
        drop(state);
        sync_tips(host, now_usable);
        // After the state lock is released: rendering the tray reads the keyboard status.
        publish(host, changed);
        host.emit_keyboard_changed(&view);
        Ok(view)
    }

    /// The save failed after the new keys registered: leave only the old keys registered.
    fn roll_back(&self, state: &mut State, id: ActionId, rows: &Rows, old_live: bool) {
        self.registrar.unregister(id);
        if !old_live {
            return;
        }
        // Two were registered and a second unregister drops the oldest: the first call dropped
        // the old keys, this one drops the new keys, and the old keys are registered again (which
        // can fail, and then the status is Failed).
        self.registrar.unregister(id);
        state.slots[id.index()] =
            self.register_one(id, effective(rows, id, Slot::Global).as_deref());
    }

    /// Sets a binding back to its default (or empties it, when it has none), by the same path
    /// as a change. A default another action holds is refused with `InUse`.
    pub fn restore_default<H: Host>(
        &self,
        host: &H,
        id: ActionId,
        slot: Slot,
    ) -> Result<KeyboardView, KeyboardError> {
        let default = action(id).default_for(slot).map(str::to_owned);
        self.set_binding(host, id, slot, default, true)
    }
}

fn clash<H: Host>(
    host: &H,
    acc: &Accelerator,
    id: ActionId,
    slot: Slot,
) -> Result<Option<Holder>, KeyboardError> {
    let service = host.service().ok_or(KeyboardError::Store)?;
    let guard = lock(service);
    let store = guard.store().ok_or(KeyboardError::Store)?;
    store
        .read(|txn| conflicts::clash(txn, acc, (id, slot)))
        .map_err(|error| {
            eprintln!("keyboard: could not check for a clash ({error})");
            KeyboardError::Store
        })
}

/// Saves the row under the session lock. Returns the result and, when the save moved the store
/// status, the view to publish (the caller publishes it with no keyboard lock held).
fn save<H: Host>(host: &H, id: ActionId, slot: Slot, text: &str) -> (Result<(), String>, Changed) {
    let Some(service) = host.service() else {
        return (Err("Orasenda is still starting".into()), None);
    };
    let now_ms = host.now_ms();
    let mut service = lock(service);
    let before = service.store_status();
    let result = service.save_binding(id, slot, text, now_ms);
    let changed = (service.store_status() != before).then(|| service.snapshot(now_ms));
    (result.map_err(|error| error.to_string()), changed)
}

fn publish<H: Host>(host: &H, changed: Changed) {
    if let Some((seq, view)) = changed {
        scheduler::publish_view(host, seq, &view);
    }
}
