//! Orphans (live tasks whose lane isn't a column) go to the end of Backlog: at service start,
//! and when Undo restores a task into a removed column.

use orasenda_core::NotificationStatus;
use orasenda_store::Store;
use orasenda_store::tasks::{self, NewTask, TaskKind};

use super::*;
use crate::session::test_support::{Log, fakes, memory_store};
use crate::session::{SessionService, lock};

pub(super) fn orphan(store: &Store, id: &str, rank: &str) {
    let new = NewTask {
        id: id.into(),
        title: format!("Orphan {id}"),
        notes: String::new(),
        tags: Vec::new(),
        kind: TaskKind::Deep,
        estimate: None,
        due: None,
        priority: None,
        checklist: Vec::new(),
        lane: tasks::Lane::parse("c_gone0001").expect("an id"),
        rank: rank.into(),
        frog_day: None,
        source_note_id: None,
        origin: None,
        created_at: 5,
    };
    store
        .write(5, |txn| tasks::insert(txn, &new))
        .expect("orphan written");
}

fn host_on(store: Store) -> (TestHost, Log) {
    let f = fakes(NotificationStatus::NotDetermined, false);
    let log = f.log.clone();
    let service = SessionService::new(Ok(store), f.platform, T0);
    (TestHost::with(service, f.log, f.notifier), log)
}

#[test]
fn orphans_repaired_at_start() {
    let store = memory_store();
    orphan(&store, "o1", "a");
    orphan(&store, "o2", "b");
    let before = store.change_log_ids().len();
    let (host, log) = host_on(store);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(titles(&board, Lane::BACKLOG), ["Orphan o1", "Orphan o2"]);
    assert!(log.take().is_empty(), "the start repair emits nothing");
    let guard = lock(host.service().expect("service"));
    let ids = guard.store().expect("store").change_log_ids();
    assert_eq!(ids.len(), before + 2, "each move is logged: {ids:?}");
}

#[test]
fn orphans_land_after_the_existing_backlog() {
    let store = memory_store();
    orphan(&store, "o1", "a");
    let (host, _) = host_on(store);
    let kept = add(&host, "Later", Lane::BACKLOG);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(titles(&board, Lane::BACKLOG), ["Orphan o1", "Later"]);
    assert_eq!(kept.lane, Lane::BACKLOG);
}

#[test]
fn restore_into_removed_lane_goes_to_backlog() {
    let host = host();
    let custom = run_board_column_add(&host, Lane::TODAY).expect("adds");
    let task = add(&host, "Strayed", custom.clone());
    add(&host, "First", Lane::BACKLOG);
    run_task_remove(&host, &task.id).expect("removes");
    run_board_column_remove(&host, custom.clone()).expect("column is empty");
    changed(&host);
    run_task_restore(&host, &task.id).expect("restores");
    let board = run_board_get(&host).expect("reads");
    assert_eq!(titles(&board, Lane::BACKLOG), ["First", "Strayed"]);
    assert_eq!(changed(&host).len(), 1);
}

#[test]
fn restore_into_a_kept_lane_stays_put() {
    let host = host();
    let custom = run_board_column_add(&host, Lane::TODAY).expect("adds");
    let task = add(&host, "Home", custom.clone());
    run_task_remove(&host, &task.id).expect("removes");
    run_task_restore(&host, &task.id).expect("restores");
    let board = run_board_get(&host).expect("reads");
    assert_eq!(titles(&board, custom), ["Home"]);
}
