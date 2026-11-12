//! `presets_list`: the live presets, as the webview and the menu bar list them.

use orasenda_core::{NotificationStatus, default_presets};
use orasenda_store::presets;

use super::super::test_support::*;
use super::super::*;
use crate::api::entries;

#[test]
fn presets_list_is_the_live_library_in_order() {
    let host = TestHost::fresh(NotificationStatus::NotDetermined);
    let listed = run_presets_list(&host);
    let shape: Vec<_> = listed
        .iter()
        .map(|e| {
            (
                e.name.as_str(),
                e.focus_min,
                e.break_min,
                e.is_default,
                e.is_changed,
            )
        })
        .collect();
    assert_eq!(
        shape,
        [
            ("Gentle Start", 15, 5, true, false),
            ("Steady Focus", 25, 5, true, false),
            ("Deep Work", 90, 15, true, false),
        ]
    );
    assert_eq!(listed[1].long_break_min, 15);
    assert_eq!(listed[1].rounds, 4);
}

#[test]
fn presets_list_leaves_out_removed_presets() {
    let mut s = service();
    db(&s)
        .write(T0, |txn| presets::remove(txn, &default_id(0)))
        .expect("removes");
    let back = relaunch(&mut s, T0);
    let names: Vec<_> = back.presets().into_iter().map(|e| e.name).collect();
    assert_eq!(names, ["Steady Focus", "Deep Work"]);
}

#[test]
fn presets_list_without_a_store_is_core_defaults() {
    let s = SessionService::new(
        Err(orasenda_store::OpenError::Io("denied".into())),
        fakes(NotificationStatus::NotDetermined, false).platform,
        T0,
    );
    assert_eq!(s.presets(), entries(&default_presets()));
}
