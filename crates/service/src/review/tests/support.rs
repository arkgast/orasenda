//! Rows and settings the stats and buffer tests start from. `T0` is Saturday 7 November 2026,
//! 01:00 local (UTC+1), so the current week starts on Monday 2 November.

use orasenda_core::{EndReason, Phase, SessionId, SessionPreset, SessionRecord};
use orasenda_store::focus_sessions;
use orasenda_store::routines::routine_runs::{self, NewRun, RunOutcome};
use orasenda_store::tasks::{self, Lane as StoredLane, NewTask, TaskKind};

use crate::api::Settings;
use crate::session::test_support::{MINUTE, T0, TestHost, db};
use crate::session::{lock, run_set_settings};

pub(super) const HOUR: u64 = 60 * MINUTE;
pub(super) const DAY: u64 = 24 * HOUR;

/// A fresh install on an in-memory store.
pub(super) fn host() -> TestHost {
    TestHost::fresh(orasenda_core::NotificationStatus::NotDetermined)
}

/// A focus session that started `days_ago` days before `T0` (at 09:00 UTC) and ran `minutes`.
pub(super) fn session(host: &TestHost, id: &str, days_ago: u64, minutes: u64, task: Option<&str>) {
    let started_ms = T0 - days_ago * DAY + 9 * HOUR;
    let record = SessionRecord {
        id: SessionId(id.to_owned()),
        preset: SessionPreset::Quick,
        phase: Phase::Focus,
        planned_ms: 25 * MINUTE,
        started_ms,
        ended_ms: started_ms + minutes * MINUTE,
        paused_total_ms: 0,
        focused_ms: minutes * MINUTE,
        end_reason: EndReason::Completed,
        extensions: 0,
        break_kind: None,
        task_id: task.map(str::to_owned),
    };
    let service = lock(&host.0.service);
    db(&service)
        .write(record.ended_ms, |txn| focus_sessions::insert(txn, &record))
        .expect("inserts a session");
}

/// A Done task finished `days_ago` days before `T0`, with an estimate, and `counted` focus
/// sessions of 25 minutes linked to it.
pub(super) fn done_task(
    host: &TestHost,
    id: &str,
    days_ago: u64,
    estimate: Option<u8>,
    counted: u32,
) {
    let done_at = T0 - days_ago * DAY + 10 * HOUR;
    let new = NewTask {
        id: id.to_owned(),
        title: id.to_owned(),
        notes: String::new(),
        tags: Vec::new(),
        kind: TaskKind::Deep,
        estimate,
        due: None,
        priority: None,
        checklist: Vec::new(),
        lane: StoredLane::Done,
        rank: "a".to_owned(),
        frog_day: None,
        source_note_id: None,
        origin: None,
        created_at: done_at,
    };
    {
        let service = lock(&host.0.service);
        db(&service)
            .write(done_at, |txn| tasks::insert(txn, &new))
            .expect("inserts a task");
    }
    for n in 0..counted {
        session(host, &format!("{id}-s{n}"), days_ago, 25, Some(id));
    }
}

/// Ten Done tasks in three different weeks, each estimated at 2 sessions and worked on for 3:
/// the buffer suggestion's threshold, with a ratio of 1.5 (50%).
pub(super) fn ten_tasks(host: &TestHost) {
    for n in 0..10u64 {
        done_task(host, &format!("t{n}"), n * 3, Some(2), 3);
    }
}

/// Saves `change` over the presented settings, through the command's own path.
pub(super) fn settings(host: &TestHost, change: impl FnOnce(&mut Settings)) {
    let mut settings = lock(&host.0.service).settings();
    change(&mut settings);
    run_set_settings(host, settings).expect("settings save");
}

/// `finished` finished runs of a routine, on 2 November onwards, and one stopped run.
pub(super) fn finished_runs(host: &TestHost, routine_id: &str, finished: u64) {
    let service = lock(&host.0.service);
    db(&service)
        .write(T0, |txn| {
            for n in 0..finished {
                let run = NewRun {
                    id: format!("run-{routine_id}-{n}"),
                    routine_id: routine_id.to_owned(),
                    day: format!("2026-11-0{}", n + 2),
                    step_ids: Vec::new(),
                };
                routine_runs::start(txn, &run)?;
                routine_runs::end(txn, &run.id, RunOutcome::Finished)?;
            }
            let stopped = NewRun {
                id: format!("run-{routine_id}-stopped"),
                routine_id: routine_id.to_owned(),
                day: "2026-11-05".to_owned(),
                step_ids: Vec::new(),
            };
            routine_runs::start(txn, &stopped)?;
            routine_runs::end(txn, &stopped.id, RunOutcome::Stopped)?;
            Ok(())
        })
        .expect("inserts runs");
}
