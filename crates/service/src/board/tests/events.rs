use super::*;
use crate::scheduler::iterate;
use std::sync::atomic::Ordering;

#[test]
fn events_emitted_after_lock() {
    let host = host();
    let a = add(&host, "A", Lane::Backlog);
    run_task_move(&host, &a.id, Lane::Today, 0).expect("moves");
    run_task_remove(&host, &a.id).expect("removes");
    let events = changed(&host);
    assert_eq!(events.len(), 3, "one per write");
    let seqs: Vec<u64> = events.iter().map(|(s, _)| *s).collect();
    assert!(seqs.windows(2).all(|w| w[0] < w[1]), "seq grows: {seqs:?}");
    assert_eq!(host.0.under_lock.load(Ordering::SeqCst), 0);
    run_task_add(&host, draft(" ", Lane::Backlog)).expect_err("refused");
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
