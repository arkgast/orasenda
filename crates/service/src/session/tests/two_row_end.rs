//! The focus row and the break row are written together, when the break ends.

use orasenda_core::{EndReason, Phase};

use super::super::test_support::*;
use super::super::*;
use crate::api::StoreStatus;

#[test]
fn nothing_is_written_for_the_focus_until_its_break_ends() {
    let mut s = service();
    numbered_break_ids(&mut s);
    s.apply(start(), T0, id("a"));
    s.tick(T0 + CLASSIC_MS);
    assert_eq!(row_count(db(&s)), 0, "the open focus lives in the snapshot");
    assert!(snapshot(db(&s)).is_some());
    s.tick(T0 + CLASSIC_END_MS);
    assert_eq!(row_count(db(&s)), 2);
    assert_eq!(snapshot(db(&s)), None);
}

#[test]
fn two_row_end_write_fails_keeps_both_unsaved_once() {
    let mut s = service();
    numbered_break_ids(&mut s);
    s.apply(start(), T0, id("a"));
    s.tick(T0 + CLASSIC_MS);
    db(&s).fail_writes(true);
    let ended = s.tick(T0 + CLASSIC_END_MS);
    assert_eq!(ended.view.store, StoreStatus::Unavailable);
    assert_eq!(s.unsaved.len(), 2);
    let phases: Vec<_> = s.unsaved.iter().map(|r| (r.phase, r.end_reason)).collect();
    assert_eq!(
        phases,
        [
            (Phase::Focus, EndReason::Completed),
            (Phase::Break, EndReason::Completed)
        ]
    );
    // Retried every tick, and still held once each.
    s.tick(T0 + CLASSIC_END_MS + 1_000);
    s.tick(T0 + CLASSIC_END_MS + 2_000);
    assert_eq!(s.unsaved.len(), 2);
    assert_eq!(row_count(db(&s)), 0);

    db(&s).fail_writes(false);
    let flushed = s.tick(T0 + CLASSIC_END_MS + 3_000);
    assert_eq!(flushed.view.store, StoreStatus::Ok);
    assert!(s.unsaved.is_empty());
    assert_eq!(row_count(db(&s)), 2, "both rows, each once");
    s.tick(T0 + CLASSIC_END_MS + 4_000);
    assert_eq!(row_count(db(&s)), 2);
}

#[test]
fn extending_from_a_break_writes_all_three_rows_in_one_end() {
    let mut s = service();
    numbered_break_ids(&mut s);
    s.apply(start(), T0, id("a"));
    s.tick(T0 + CLASSIC_MS);
    s.apply(Action::Extend, T0 + CLASSIC_MS + MINUTE, id("x"));
    let end = T0 + CLASSIC_MS + MINUTE + 10 * MINUTE;
    let on_break = s.tick(end);
    let done = end + on_break.view.remaining_ms;
    let ended = s.tick(done);
    assert_eq!(ended.milestones.len(), 1);
    // Focus, the cut break, the final break; the second break has its own id.
    assert_eq!(row_count(db(&s)), 3);
    assert_eq!(
        on_break.view.session_id,
        Some(orasenda_core::SessionId("brk-2".into()))
    );
}
