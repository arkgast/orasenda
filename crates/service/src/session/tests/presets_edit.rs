//! Editing the preset library: add, update, remove with undo, restore.

use orasenda_core::NotificationStatus;

use super::super::test_support::*;
use super::super::*;
use crate::api::{PresetError, PresetErrorKind, PresetPatch};
use crate::scheduler::Host;

fn host() -> TestHost {
    TestHost::fresh(NotificationStatus::NotDetermined)
}

fn log_ids(h: &TestHost) -> Vec<String> {
    let guard = lock(h.service().expect("service"));
    db(&guard).change_log_ids()
}

fn names(host: &TestHost) -> Vec<String> {
    run_presets_list(host).into_iter().map(|e| e.name).collect()
}

fn kind<T: std::fmt::Debug>(r: Result<T, PresetError>) -> PresetErrorKind {
    r.expect_err("the edit is refused").kind
}

fn rename(name: &str) -> PresetPatch {
    PresetPatch {
        name: Some(name.into()),
        ..PresetPatch::default()
    }
}

#[test]
fn add_at_twelve_is_limit() {
    let h = host();
    let added = run_preset_add(&h).expect("adds");
    assert_eq!(
        (added.name.as_str(), added.focus_min, added.long_break_min),
        ("New preset", 25, 15)
    );
    for _ in 0..8 {
        run_preset_add(&h).expect("adds");
    }
    assert_eq!(run_presets_list(&h).len(), 12);
    assert_eq!(kind(run_preset_add(&h)), PresetErrorKind::Limit);
    assert_eq!(names(&h)[3], "New preset");
    assert_eq!(names(&h)[4], "New preset 2");
}

#[test]
fn remove_last_is_last_preset() {
    let h = host();
    run_preset_remove(&h, default_id(0)).expect("removes");
    run_preset_remove(&h, default_id(2)).expect("removes");
    assert_eq!(
        kind(run_preset_remove(&h, default_id(1))),
        PresetErrorKind::LastPreset
    );
    assert_eq!(names(&h), ["Steady Focus"]);
}

#[test]
fn remove_selected_selects_first() {
    let h = host();
    run_preset_update(&h, default_id(1), rename("Steady")).expect("renames");
    h.log().take();
    let live = run_preset_remove(&h, default_id(1)).expect("removes");
    assert_eq!(live.len(), 2);
    assert_eq!(current_settings(&h).preset_id, default_id(0));
    let log = h.log().take();
    assert!(log.iter().any(|e| matches!(e, Event::PresetsChanged(_))));
    assert!(
        log.iter()
            .any(|e| matches!(e, Event::SettingsChanged(s) if s.preset_id == default_id(0)))
    );
}

#[test]
fn remove_other_keeps_selection_and_settings_quiet() {
    let h = host();
    h.log().take();
    run_preset_remove(&h, default_id(2)).expect("removes");
    assert_eq!(current_settings(&h).preset_id, default_id(1));
    assert!(
        !h.log()
            .take()
            .iter()
            .any(|e| matches!(e, Event::SettingsChanged(_)))
    );
}

#[test]
fn undo_remove_name_taken_is_duplicate() {
    let h = host();
    run_preset_remove(&h, default_id(2)).expect("removes");
    let added = run_preset_add(&h).expect("adds");
    run_preset_update(&h, added.id, rename("deep work")).expect("takes the name");
    assert_eq!(
        kind(run_preset_undo_remove(&h, default_id(2))),
        PresetErrorKind::DuplicateName
    );
    assert_eq!(names(&h), ["Gentle Start", "Steady Focus", "deep work"]);
}

#[test]
fn undo_remove_brings_it_back_in_place() {
    let h = host();
    run_preset_remove(&h, default_id(0)).expect("removes");
    let live = run_preset_undo_remove(&h, default_id(0)).expect("undoes");
    let order: Vec<_> = live.iter().map(|e| e.name.as_str()).collect();
    assert_eq!(order, ["Gentle Start", "Steady Focus", "Deep Work"]);
}

#[test]
fn restore_defaults_positions_and_past_twelve() {
    let h = host();
    let user = run_preset_add(&h).expect("adds");
    run_preset_remove(&h, default_id(0)).expect("removes");
    run_preset_update(
        &h,
        default_id(1),
        PresetPatch {
            focus_min: Some(30),
            ..PresetPatch::default()
        },
    )
    .expect("edits");
    let live = run_presets_restore_defaults(&h).expect("restores");
    let shape: Vec<_> = live
        .iter()
        .map(|e| (e.name.as_str(), e.focus_min, e.is_changed))
        .collect();
    assert_eq!(
        shape,
        [
            ("Gentle Start", 15, false),
            ("Steady Focus", 25, false),
            ("Deep Work", 90, false),
            ("New preset", 25, false)
        ]
    );
    assert!(live[3].id == user.id && !live[3].is_default);

    // Twelve live, three defaults removed and restored: past twelve.
    let h = host();
    for _ in 0..9 {
        run_preset_add(&h).expect("adds");
    }
    for i in 0..3 {
        run_preset_remove(&h, default_id(i)).expect("removes");
    }
    for _ in 0..3 {
        run_preset_add(&h).expect("adds");
    }
    assert_eq!(run_presets_list(&h).len(), 12);
    assert_eq!(
        run_presets_restore_defaults(&h).expect("restores").len(),
        15
    );
}

#[test]
fn update_validates_and_refuses_duplicates() {
    let h = host();
    let blank = run_preset_update(&h, default_id(1), rename("   ")).expect_err("blank");
    assert_eq!(
        (blank.kind, blank.field),
        (
            PresetErrorKind::Invalid,
            Some(orasenda_core::PresetField::Name)
        )
    );
    assert_eq!(
        kind(run_preset_update(&h, default_id(1), rename("DEEP WORK"))),
        PresetErrorKind::DuplicateName
    );
    let bad = PresetPatch {
        focus_min: Some(4),
        ..PresetPatch::default()
    };
    let err = run_preset_update(&h, default_id(1), bad).expect_err("range");
    assert_eq!(err.field, Some(orasenda_core::PresetField::FocusMin));
    // Renaming to its own name with other case is allowed.
    run_preset_update(&h, default_id(1), rename("steady focus")).expect("own name");
}

#[test]
fn update_logs_changed_fields_only() {
    let h = host();
    let before = log_ids(&h).len();
    let patch = PresetPatch {
        focus_min: Some(30),
        break_min: Some(5),
        ..PresetPatch::default()
    };
    run_preset_update(&h, default_id(1), patch).expect("edits");
    let ids = log_ids(&h);
    assert_eq!(ids[before..], [default_id(1).0]);
}

#[test]
fn every_write_emits_presets_changed() {
    let h = host();
    h.log().take();
    run_preset_add(&h).expect("adds");
    run_preset_update(&h, default_id(0), rename("Soft")).expect("edits");
    let n = h.log().count(|e| matches!(e, Event::PresetsChanged(_)));
    assert_eq!(n, 2);
}
