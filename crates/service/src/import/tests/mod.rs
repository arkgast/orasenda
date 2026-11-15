//! The import's pure parts: dates, fitting and the Reminders and Things mappings and the Todoist parser.

mod commit;
mod dates;
mod fit;
mod matching;
mod preview;
mod reminders;
mod sources;
mod things;
mod todoist;
mod todoist_zip;
mod undo;

use orasenda_core::NotificationStatus;
use orasenda_core::platform::import::ReminderItem;
use orasenda_store::tasks::{self, Lane, NewTask, TaskKind};

use crate::scheduler::Host;
use crate::session::test_support::TestHost;
use crate::session::{Action, lock};

/// A fresh install on an in-memory store.
fn host() -> TestHost {
    TestHost::fresh(NotificationStatus::NotDetermined)
}

fn reminder(id: &str, title: &str) -> ReminderItem {
    ReminderItem {
        id: id.into(),
        title: title.into(),
        notes: String::new(),
        url: String::new(),
        list: "Home".into(),
        priority: 0,
        due: None,
        recurring: false,
        created_ms: None,
    }
}

/// Inserts a task holding `origin`; removed when `live` is false.
fn seed(host: &TestHost, id: &str, origin: &str, lane: Lane, live: bool) {
    let guard = lock(host.service().unwrap());
    guard
        .store()
        .unwrap()
        .write(host.now_ms(), |txn| {
            tasks::insert(
                txn,
                &NewTask {
                    id: id.into(),
                    title: id.into(),
                    notes: String::new(),
                    tags: Vec::new(),
                    kind: TaskKind::Deep,
                    estimate: None,
                    due: None,
                    priority: None,
                    checklist: Vec::new(),
                    lane,
                    rank: id.into(),
                    frog_day: None,
                    source_note_id: None,
                    origin: Some(origin.into()),
                    created_at: txn.now_ms(),
                },
            )?;
            if !live {
                tasks::remove(txn, id, txn.now_ms())?;
            }
            Ok(())
        })
        .expect("seeds");
}

fn start_session(host: &TestHost) {
    let ids = || orasenda_core::SessionId("s1".into());
    lock(host.service().unwrap()).apply(
        Action::Start(crate::api::StartRequest::default()),
        host.now_ms(),
        ids,
    );
}

/// Sets up Reminders with `n` open reminders `r0..`, previews them and answers the preview.
fn preview_reminders(host: &TestHost, n: usize) -> crate::api::ImportPreview {
    let items = (0..n)
        .map(|i| reminder(&format!("r{i}"), &format!("T{i}")))
        .collect();
    host.0
        .imports
        .set_reminders(crate::session::test_support::FakeReminders::new(
            orasenda_core::platform::import::SourceAccess::Granted,
            items,
        ));
    crate::import::run_import_preview(host, crate::api::PreviewRequest::Reminders).unwrap()
}

/// Every live task, in lane then rank order.
fn live_tasks(host: &TestHost) -> Vec<tasks::TaskRow> {
    let guard = lock(host.service().unwrap());
    guard.store().unwrap().read(tasks::list_live).unwrap()
}
