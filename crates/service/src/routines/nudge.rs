//! The due nudge (spec 2026-11-14, §Nudge): one local notification when a routine's time
//! comes, "<name> is ready when you are."
//!
//! The scheduler calls [`nudge_due`] every tick; it works once per new local minute. It posts
//! only while `notify.routine_due` is on and the notification status, read just before
//! posting, is `granted`; at most once per routine per local date, inside the 30-minute grace
//! window, never for a routine finished today or one with *Any time* (core `due_now`). The
//! routines already nudged are kept in memory only, so a relaunch inside the window can nudge
//! once more (accepted in the spec).

use std::collections::BTreeSet;

use orasenda_core::routines::{due_now, minute_of_day};
use orasenda_core::{LocalDate, NotificationStatus, Weekdays};

use crate::api::RoutineToday;
use crate::scheduler::{Host, store_status};
use crate::session::{SessionService, lock};

const MINUTE_MS: u64 = 60_000;

/// What the nudge remembers between ticks. Memory only.
#[derive(Debug, Default)]
pub struct NudgeState {
    /// The last minute (since the epoch) the routines were checked.
    minute: Option<u64>,
    /// The routines nudged, by id and local date.
    nudged: BTreeSet<(String, LocalDate)>,
}

/// A routine that is due now.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Due {
    id: String,
    name: String,
    day: LocalDate,
}

/// The nudge's text for routine `name`.
pub fn nudge_text(name: &str) -> String {
    format!("{name} is ready when you are.")
}

/// Posts the nudge for each routine that became due, once per new local minute. The service
/// lock is never held while the notifier is asked or posts.
pub fn nudge_due<H: Host>(host: &H) {
    let Some(service) = host.service() else {
        return;
    };
    let due = lock(service).routines_due(host.now_ms());
    if due.is_empty() {
        return;
    }
    let notifier = host.notifier();
    let status = notifier.status();
    store_status(host, status);
    if status != NotificationStatus::Granted {
        return;
    }
    let fresh = lock(service).mark_nudged(due);
    for name in fresh {
        if let Err(error) = notifier.post(&nudge_text(&name), "") {
            eprintln!("routines: could not post the due nudge ({error})");
        }
    }
}

impl SessionService {
    /// The routines due at `now_ms`, worked out once per new minute and only while
    /// `notify.routine_due` is on. A failed read is logged and gives none; the next minute,
    /// still inside the window, tries again.
    pub(crate) fn routines_due(&mut self, now_ms: u64) -> Vec<Due> {
        let minute = now_ms / MINUTE_MS;
        if self.nudge.minute == Some(minute) {
            return Vec::new();
        }
        self.nudge.minute = Some(minute);
        if !self.settings().notify_routine_due {
            return Vec::new();
        }
        let local = self.routines_local(now_ms);
        let today = local.today;
        // Yesterday's marks can't match again.
        self.nudge.nudged.retain(|(_, day)| *day == today);
        let view = match self.routines_view(now_ms) {
            Ok(view) => view,
            Err(error) => {
                eprintln!("routines: could not read the routines for the nudge ({error})");
                return Vec::new();
            }
        };
        let local_minute = minute_of_day(now_ms, local.offset_min);
        view.routines
            .into_iter()
            .filter(|routine| {
                let Some(days) = Weekdays::from_bits(routine.days) else {
                    return false;
                };
                due_now(
                    routine.time_of_day,
                    days,
                    today.weekday(),
                    local_minute,
                    routine.today == RoutineToday::Finished,
                    self.nudge.nudged.contains(&(routine.id.clone(), today)),
                )
            })
            .map(|routine| Due {
                id: routine.id,
                name: routine.name,
                day: today,
            })
            .collect()
    }

    /// Marks `due` as nudged; the names of those not marked before, to post.
    pub(crate) fn mark_nudged(&mut self, due: Vec<Due>) -> Vec<String> {
        due.into_iter()
            .filter(|due| self.nudge.nudged.insert((due.id.clone(), due.day)))
            .map(|due| due.name)
            .collect()
    }
}
