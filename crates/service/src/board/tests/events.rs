use super::*;
use crate::scheduler::iterate;
use std::sync::atomic::Ordering;

#[test]
fn events_emitted_after_lock() {
    let host = host();
    let a = add(&host, "A", Lane::BACKLOG);
    run_task_move(&host, &a.id, Lane::TODAY, 0).expect("moves");
    run_task_remove(&host, &a.id).expect("removes");
    let events = changed(&host);
    assert_eq!(events.len(), 3, "one per write");
    let seqs: Vec<u64> = events.iter().map(|(s, _)| *s).collect();
    assert!(seqs.windows(2).all(|w| w[0] < w[1]), "seq grows: {seqs:?}");
    assert_eq!(host.0.under_lock.load(Ordering::SeqCst), 0);
    run_task_add(&host, draft(" ", Lane::BACKLOG)).expect_err("refused");
    assert!(changed(&host).is_empty(), "a refused write emits nothing");
}

#[test]
fn the_board_is_emitted_again_at_the_day_roll() {
    let host = host();
    iterate(&host);
    host.log().take();
    host.set_now(T0 + 22 * HOUR);
    iterate(&host);
    assert!(changed(&host).is_empty(), "nothing within the day");
    host.set_now(T0 + 23 * HOUR);
    iterate(&host);
    let events = changed(&host);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].1.today, "2026-11-08");
    assert_eq!(host.0.under_lock.load(Ordering::SeqCst), 0);
    host.set_now(T0 + 23 * HOUR + MINUTE);
    iterate(&host);
    assert!(changed(&host).is_empty(), "once per day");
}

#[test]
fn column_commands_emit_after_lock() {
    let host = host();
    let custom = run_board_column_add(&host, Lane::TODAY).expect("adds");
    run_board_column_edit(&host, custom.clone(), "Review".into(), Some(2)).expect("edits");
    run_board_column_fold(&host, custom.clone(), true).expect("folds");
    run_board_column_remove(&host, custom).expect("removes");
    let events = changed(&host);
    assert_eq!(events.len(), 4, "one per command");
    let seqs: Vec<u64> = events.iter().map(|(s, _)| *s).collect();
    assert!(seqs.windows(2).all(|w| w[0] < w[1]), "seq grows: {seqs:?}");
    assert_eq!(events[1].1.columns[2].name, "Review");
    assert!(events[2].1.columns[2].folded);
    assert_eq!(events[3].1.columns.len(), 4);
    assert_eq!(host.0.under_lock.load(Ordering::SeqCst), 0);
}
