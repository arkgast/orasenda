//! Today's stored rows are read once per (day, write generation); a failed read shows.

use uuid::Uuid;

use super::super::test_support::*;
use super::super::*;
use crate::api::StoreStatus;

const DAY: u64 = 24 * 60 * MINUTE;

/// A service in the break of its first session, the cache filled by the tick that began it.
fn in_break() -> (SessionService, u64) {
    let mut s = service();
    s.apply(start(), T0, id("f1"));
    let at = T0 + CLASSIC_MS + MINUTE;
    assert!(s.tick(at).view.suggestion.is_some(), "a break is showing");
    (s, at)
}

#[test]
fn idle_views_read_store_once_per_generation() {
    let (s, at) = in_break();
    let before = s.day_cache.reads();
    for second in 0..10 {
        s.view(at + second * 1000);
    }
    assert_eq!(s.day_cache.reads(), before);

    // Idle with the cap line on reads once as well.
    let mut idle = service();
    change_settings(&mut idle, |settings| {
        settings.deep_cap_on = true;
        settings.deep_cap_hours = 2;
    });
    idle.view(T0);
    let first = idle.day_cache.reads();
    for second in 1..10 {
        idle.view(T0 + second * 1000);
    }
    assert_eq!(idle.day_cache.reads(), first);
}

#[test]
fn write_bumps_generation_and_rereads() {
    let (mut s, at) = in_break();
    s.view(at);
    let before = s.day_cache.reads();
    // The break ends: the rows are written, so the next read goes to the store, once.
    s.tick(T0 + CLASSIC_END_MS);
    s.view(T0 + CLASSIC_END_MS);
    s.view(T0 + CLASSIC_END_MS + 1000);
    let during = s.day_cache.reads();
    assert!(during > before, "the write forced a read");
    s.view(T0 + CLASSIC_END_MS + 2000);
    assert_eq!(s.day_cache.reads(), during, "and only one");
}

#[test]
fn day_change_rereads() {
    let (s, at) = in_break();
    s.view(at);
    let before = s.day_cache.reads();
    s.round_for(&library_preset(0), at + DAY);
    assert_eq!(s.day_cache.reads(), before + 1);
    s.round_for(&library_preset(0), at + DAY + 1000);
    assert_eq!(s.day_cache.reads(), before + 1);
}

#[test]
fn failed_day_read_shows_store_unavailable_and_retries() {
    let (mut s, _) = in_break();
    // Finish the break so the first session's rows are stored, then read them.
    let done = T0 + CLASSIC_END_MS;
    s.tick(done);
    assert_eq!(s.view(done).store, StoreStatus::Ok);
    assert!(row_count(db(&s)) > 0, "rows are stored");
    assert_eq!(
        s.round_for(&library_preset(0), done),
        2,
        "the stored rows count"
    );
    s.day_cache.bump();
    db(&s).fail_reads(true);
    assert_eq!(s.view(done).store, StoreStatus::Unavailable);
    // Not kept: the next view reads again, and the round falls back to the first.
    let reads = s.day_cache.reads();
    assert_eq!(s.view(done + 1000).store, StoreStatus::Unavailable);
    assert_eq!(s.day_cache.reads(), reads + 1);
    assert_eq!(s.round_for(&library_preset(0), done), 1);
    db(&s).fail_reads(false);
    assert_eq!(s.view(done + 2000).store, StoreStatus::Ok);
}

#[test]
fn successful_write_clears_a_failed_read_until_the_next_read() {
    // A deliberate change from "only a read clears it": a focus runs without any view
    // reading today's rows, so a working write must not leave the store line up.
    let (mut s, at) = in_break();
    s.day_cache.bump();
    db(&s).fail_reads(true);
    assert_eq!(s.view(at).store, StoreStatus::Unavailable);
    s.tick(T0 + CLASSIC_END_MS);
    assert_eq!(s.store_status, StoreStatus::Ok, "the write worked");
    assert_eq!(
        s.view(T0 + CLASSIC_END_MS + 1000).store,
        StoreStatus::Unavailable
    );
}

#[test]
fn stored_row_ids_are_uuid_v7() {
    let mut s = service();
    let mut at = T0;
    for _ in 0..2 {
        let focus = run::new_session_id();
        let started = s.apply(start(), at, move || focus);
        let to_break = s.tick(at + started.view.remaining_ms);
        at += started.view.remaining_ms + to_break.view.remaining_ms;
        s.tick(at);
    }
    let rows = stored_rows(db(&s));
    assert_eq!(rows.len(), 4, "two focuses and two breaks: {rows:?}");
    for row in rows {
        let id = row.split(':').next().expect("an id");
        let uuid = Uuid::parse_str(id).expect("a UUID");
        assert_eq!(uuid.get_version_num(), 7, "{id}");
    }
}
