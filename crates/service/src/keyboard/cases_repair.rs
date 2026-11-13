//! The repair pass: one deterministic answer when two bindings meet.

use orasenda_store::{Store, settings};

use super::Accelerator;
use super::cases_registry::mem_store;
use super::conflicts::{Holder, clash, is_repaired, repair, write_row};
use super::registry::{FIXED, settings_key};
use super::{ActionId, Slot};

fn put(store: &Store, id: ActionId, slot: Slot, value: &str) {
    store
        .write(1, |txn| {
            settings::set(txn, &settings_key(id, slot), &value.to_string())
        })
        .expect("writes");
}

fn row(store: &Store, id: ActionId, slot: Slot) -> Option<String> {
    store
        .read(|txn| settings::get(txn, &settings_key(id, slot)))
        .expect("reads")
}

fn run(store: &Store) -> Vec<(ActionId, Slot)> {
    store.write(2, repair).expect("repairs")
}

fn repaired(store: &Store, id: ActionId, slot: Slot) -> bool {
    store.read(|txn| is_repaired(txn, id, slot)).expect("reads")
}

const CHORD: &str = "Control+Alt+KeyJ";

#[test]
fn repair_user_beats_default() {
    // A user-set slot later in the registry beats a default-valued earlier one.
    let store = mem_store();
    put(
        &store,
        ActionId::Capture,
        Slot::Global,
        "Control+Alt+Super+KeyT",
    );
    assert_eq!(run(&store), [(ActionId::Floater, Slot::Global)]);
    assert_eq!(
        row(&store, ActionId::Floater, Slot::Global).as_deref(),
        Some("off")
    );
    assert_eq!(
        row(&store, ActionId::Capture, Slot::Global).as_deref(),
        Some("Control+Alt+Super+KeyT")
    );
}

#[test]
fn repair_registry_order_marks_repaired() {
    let store = mem_store();
    put(&store, ActionId::Floater, Slot::Global, CHORD);
    put(&store, ActionId::Capture, Slot::Global, CHORD);
    assert_eq!(run(&store), [(ActionId::Capture, Slot::Global)]);
    assert_eq!(
        row(&store, ActionId::Capture, Slot::Global).as_deref(),
        Some("off")
    );
    assert!(repaired(&store, ActionId::Capture, Slot::Global));
    assert!(!repaired(&store, ActionId::Floater, Slot::Global));

    // In Orasenda comes before Everywhere inside one action.
    let store = mem_store();
    put(
        &store,
        ActionId::Floater,
        Slot::Global,
        "Control+Super+KeyJ",
    );
    put(&store, ActionId::Floater, Slot::App, "Control+Super+KeyJ");
    assert_eq!(run(&store), [(ActionId::Floater, Slot::Global)]);
}

#[test]
fn repaired_cleared_on_row_change() {
    let store = mem_store();
    put(&store, ActionId::Floater, Slot::Global, CHORD);
    put(&store, ActionId::Capture, Slot::Global, CHORD);
    run(&store);
    assert!(repaired(&store, ActionId::Capture, Slot::Global));
    store
        .write(3, |txn| {
            write_row(txn, ActionId::Capture, Slot::Global, "Control+Alt+KeyK")
        })
        .expect("writes");
    assert!(!repaired(&store, ActionId::Capture, Slot::Global));

    // A row changed by import or sync clears the mark at the next pass.
    put(&store, ActionId::Floater, Slot::Global, CHORD);
    put(&store, ActionId::Capture, Slot::Global, CHORD);
    run(&store);
    put(&store, ActionId::Capture, Slot::Global, "Control+Alt+KeyK");
    assert!(run(&store).is_empty());
    assert!(!repaired(&store, ActionId::Capture, Slot::Global));
}

#[test]
fn repair_fixed_key_wins() {
    let store = mem_store();
    put(&store, ActionId::Floater, Slot::App, "Super+KeyK");
    put(&store, ActionId::Capture, Slot::Global, "Super+KeyK");
    assert_eq!(
        run(&store),
        [
            (ActionId::Floater, Slot::App),
            (ActionId::Capture, Slot::Global)
        ]
    );
    assert!(repaired(&store, ActionId::Floater, Slot::App));
    let acc = Accelerator::parse("Super+KeyK").expect("parses");
    let held = store
        .read(|txn| clash(txn, &acc, (ActionId::Capture, Slot::Global)))
        .expect("reads");
    assert!(matches!(held, Some(Holder::Fixed(f)) if f == &FIXED[0]));
}

#[test]
fn clash_names_the_holder_and_skips_itself() {
    let store = mem_store();
    let acc = Accelerator::parse("Control+Alt+Super+KeyT").expect("parses");
    let held = |except| store.read(|txn| clash(txn, &acc, except)).expect("reads");
    assert_eq!(
        held((ActionId::Capture, Slot::Global)),
        Some(Holder::Action(ActionId::Floater, Slot::Global))
    );
    assert_eq!(held((ActionId::Floater, Slot::Global)), None);
}

#[test]
fn repair_idempotent() {
    let store = mem_store();
    put(&store, ActionId::Floater, Slot::Global, CHORD);
    put(&store, ActionId::Capture, Slot::Global, CHORD);
    put(&store, ActionId::StartPause, Slot::Global, "Super+KeyK");
    assert_eq!(run(&store).len(), 2);
    assert_eq!(run(&store), []);
    assert!(repaired(&store, ActionId::Capture, Slot::Global));
    assert!(repaired(&store, ActionId::StartPause, Slot::Global));
}

#[test]
fn repair_leaves_defaults_alone() {
    let store = mem_store();
    assert_eq!(run(&store), []);
}
