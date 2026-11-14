//! The board through the recording host: the commands, the limits, the words, the Frog, the
//! Inbox move, the events and the failures.

mod add;
mod columns;
mod events;
mod frog;
mod inbox_move;
mod settings;
mod task_link;
mod view;

use orasenda_core::NotificationStatus;

use crate::api::{BoardView, Lane, TaskDraft, TaskView};
use crate::board::*;
use crate::session::test_support::{Event, MINUTE, T0, TestHost};

pub(super) const HOUR: u64 = 60 * MINUTE;
pub(super) const DAY: u64 = 24 * HOUR;

/// A fresh install on an in-memory store. Local time is UTC+1; `T0` is Saturday 7 November
/// 2026, 01:00 local.
pub(super) fn host() -> TestHost {
    TestHost::fresh(NotificationStatus::NotDetermined)
}

pub(super) fn draft(title: &str, lane: Lane) -> TaskDraft {
    TaskDraft {
        title: title.into(),
        lane: Some(lane),
        ..TaskDraft::default()
    }
}

pub(super) fn add(host: &TestHost, title: &str, lane: Lane) -> TaskView {
    run_task_add(host, draft(title, lane)).expect("adds")
}

/// Every `board-changed` so far, taken from the log.
pub(super) fn changed(host: &TestHost) -> Vec<(u64, BoardView)> {
    host.log()
        .take()
        .into_iter()
        .filter_map(|event| match event {
            Event::BoardChanged(seq, view) => Some((seq, view)),
            _ => None,
        })
        .collect()
}

pub(super) fn lane(board: &BoardView, lane: Lane) -> &crate::api::ColumnView {
    board
        .columns
        .iter()
        .find(|c| c.lane == lane)
        .expect("every column is there")
}

pub(super) fn titles(board: &BoardView, which: Lane) -> Vec<String> {
    lane(board, which)
        .tasks
        .iter()
        .map(|t| t.title.clone())
        .collect()
}
