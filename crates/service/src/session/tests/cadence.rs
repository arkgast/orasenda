//! The round and the chain, from today's rows, the unsaved records and the open focus.

use orasenda_core::BreakKind;

use super::super::test_support::*;
use super::super::*;

fn fourth_break(s: &mut SessionService, at: u64) -> Option<BreakKind> {
    s.apply(start(), at, id("f4"));
    s.tick(at + CLASSIC_MS).view.break_kind
}

#[test]
fn round_counts_unsaved_and_open_focus() {
    // Stored rows.
    let mut s = service();
    numbered_break_ids(&mut s);
    let mut at = T0;
    for n in 1..=3 {
        at = cycle(&mut s, &format!("f{n}"), at).0;
    }
    assert_eq!(fourth_break(&mut s, at), Some(BreakKind::Long));

    // The same chain held only in `unsaved`: the writes fail, the rounds still count.
    let mut s = service();
    numbered_break_ids(&mut s);
    db(&s).fail_writes(true);
    let mut at = T0;
    for n in 1..=3 {
        at = cycle(&mut s, &format!("f{n}"), at).0;
    }
    assert_eq!(s.unsaved.len(), 6);
    assert_eq!(fourth_break(&mut s, at), Some(BreakKind::Long));
}

#[test]
fn round_ignores_stopped_and_quick_sessions() {
    let mut s = service();
    numbered_break_ids(&mut s);
    let mut at = T0;
    for n in 1..=2 {
        at = cycle(&mut s, &format!("f{n}"), at).0;
    }
    s.apply(start(), at, id("stopped"));
    s.apply(Action::Stop, at + 10 * MINUTE, id("x"));
    at += 10 * MINUTE;
    s.apply(start_quick(), at, id("quick"));
    s.tick(at + 2 * MINUTE);
    at += 2 * MINUTE;
    // Rounds so far: two completed. This is round 3, a short break.
    assert_eq!(fourth_break(&mut s, at), Some(BreakKind::Short));
}

#[test]
fn round_resets_after_a_cut_long_break() {
    let mut s = service();
    numbered_break_ids(&mut s);
    let mut at = T0;
    for n in 1..=3 {
        at = cycle(&mut s, &format!("f{n}"), at).0;
    }
    // Round 4: a long break, cut short by "+10 min", then the focus ends in another one.
    s.apply(start(), at, id("f4"));
    let long = s.tick(at + CLASSIC_MS);
    assert_eq!(long.view.break_kind, Some(BreakKind::Long));
    s.apply(Action::Extend, at + CLASSIC_MS + MINUTE, id("x"));
    let end = at + CLASSIC_MS + MINUTE + 10 * MINUTE;
    let again = s.tick(end);
    assert_eq!(again.view.break_kind, Some(BreakKind::Long));
    let done = end + again.view.remaining_ms;
    s.tick(done);
    // The chain started over, even though the first long break was cut.
    assert_eq!(fourth_break(&mut s, done), Some(BreakKind::Short));
}

#[test]
fn round_resets_after_a_gap_longer_than_the_long_break() {
    let mut s = service();
    numbered_break_ids(&mut s);
    let mut at = T0;
    for n in 1..=3 {
        at = cycle(&mut s, &format!("f{n}"), at).0;
    }
    let long_break_ms = 15 * MINUTE;
    assert_eq!(fourth_break(&mut s, at + long_break_ms + 1), Some(BreakKind::Short));
}
