//! An import that brings tasks in a column this board doesn't have repairs them to Backlog.

use orasenda_store::tasks::{self, NewTask, TaskKind};

use super::TempDir;
use super::import::{host_in, source};
use crate::api::Lane;
use crate::board::run_board_get;
use crate::data::import::run_import;
use crate::session::test_support::Event;

#[test]
fn orphans_repaired_after_import() {
    let dir = TempDir::new();
    let host = host_in(dir.path());
    let (_keep, path) = source(|store| {
        let new = NewTask {
            id: "o1".into(),
            title: "Strayed".into(),
            notes: String::new(),
            tags: Vec::new(),
            kind: TaskKind::Deep,
            estimate: None,
            due: None,
            priority: None,
            checklist: Vec::new(),
            lane: tasks::Lane::parse("c_gone0001").expect("an id"),
            rank: "a".into(),
            frog_day: None,
            source_note_id: None,
            origin: None,
            created_at: 5,
        };
        store
            .write(5, |txn| tasks::insert(txn, &new))
            .expect("task written");
    });
    host.log().take();
    run_import(&host, dir.path(), &path).expect("imports");
    let boards: Vec<_> = host
        .log()
        .take()
        .into_iter()
        .filter_map(|event| match event {
            Event::BoardChanged(_, view) => Some(view),
            _ => None,
        })
        .collect();
    assert_eq!(boards.len(), 1, "the import's own board-changed");
    let backlog = boards[0]
        .columns
        .iter()
        .find(|c| c.lane == Lane::BACKLOG)
        .expect("Backlog");
    assert_eq!(backlog.tasks.len(), 1);
    let board = run_board_get(&host).expect("reads");
    assert_eq!(
        board.columns.iter().map(|c| c.tasks.len()).sum::<usize>(),
        1
    );
}
