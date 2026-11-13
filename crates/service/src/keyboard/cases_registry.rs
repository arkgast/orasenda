//! The registry's own invariants (ADR-020).

use std::collections::HashSet;

use orasenda_store::Store;

use super::registry::{ACTIONS, FIXED, settings_key};
use super::system_keys::{never_delivered, well_known};
use super::{Accelerator, ActionId, Slot};

/// An empty in-memory store for the keyboard cases.
pub(super) fn mem_store() -> Store {
    Store::open_in_memory("device-test").expect("opens")
}

#[test]
fn registry_ids_unique() {
    let ids: HashSet<ActionId> = ACTIONS.iter().map(|a| a.id).collect();
    assert_eq!(ids.len(), ACTIONS.len());
    assert_eq!(
        ACTIONS.iter().map(|a| a.id).collect::<Vec<_>>(),
        ActionId::ALL
    );
    let keys: HashSet<String> = ACTIONS
        .iter()
        .flat_map(|a| Slot::ALL.map(|s| settings_key(a.id, s)))
        .collect();
    assert_eq!(keys.len(), ACTIONS.len() * 2);
    assert_eq!(
        settings_key(ActionId::FullScreenOther, Slot::App),
        "keys.app.full_screen_other"
    );
    for id in ActionId::ALL {
        assert_eq!(ActionId::from_name(id.name()), Some(id));
    }
}

#[test]
fn registry_defaults_valid_per_slot() {
    let mut seen: HashSet<String> = HashSet::new();
    for action in ACTIONS {
        for slot in Slot::ALL {
            let Some(text) = action.default_for(slot) else {
                continue;
            };
            let acc = Accelerator::parse(text).expect("a default parses");
            assert_eq!(
                acc.canonical(),
                text,
                "{:?} {slot:?} is canonical",
                action.id
            );
            let [control, alt, _shift, sup] = acc.modifiers();
            match slot {
                Slot::App => assert!(sup || control, "{:?} needs Command or Control", action.id),
                Slot::Global => assert!(sup || control || alt),
            }
            assert!(seen.insert(text.to_string()), "{text} is used twice");
            assert!(
                FIXED.iter().all(|fixed| fixed.keys != text),
                "{text} is a fixed key"
            );
            if slot == Slot::Global {
                assert_eq!(never_delivered(&acc), None, "{text}");
                assert_eq!(well_known(&acc), None, "{text}");
            } else {
                assert_eq!(never_delivered(&acc), None, "{text}");
            }
        }
    }
}

#[test]
fn fixed_keys_are_unique() {
    let keys: HashSet<&str> = FIXED.iter().map(|f| f.keys).collect();
    assert_eq!(keys.len(), FIXED.len());
}

#[test]
fn fixed_page_keys_name_the_real_pages() {
    let labels: Vec<_> = (1..=6)
        .map(|n| {
            let keys = format!("Super+Digit{n}");
            FIXED.iter().find(|f| f.keys == keys).expect("fixed").label
        })
        .collect();
    assert_eq!(
        labels,
        [
            "Today", "Board", "Calendar", "Routines", "Review", "Settings"
        ]
    );
}
