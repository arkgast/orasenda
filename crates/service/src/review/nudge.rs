//! The shutdown and weekly nudges (spec 2026-11-16, §Nudges): one local notification when the
//! evening shutdown or the weekly review is ready.
//!
//! The scheduler calls [`nudge_due`] every tick, right after the routines' nudge; it works
//! once per new local minute. A nudge posts only while its preference is on and the
//! notification status, read just before posting, is `granted`; at most once per kind per local
//! date, inside core `due_now`'s 30-minute window from `review.shutdown_time`, and never once
//! the shutdown or the planned week is complete. The marks are in memory only.
//!
//! The shutdown is for Monday to Friday; the weekly review is for `review.weekly_day`. Both
//! due in the same minute: only the weekly one posts and the shutdown is marked nudged for the
//! day. A routine nudge posted in that minute: no review nudge, and the due one is marked
//! nudged for the day.

use orasenda_core::review::planned_week;
use orasenda_core::routines::{due_now, minute_of_day};
use orasenda_core::{LocalDate, NotificationStatus, Weekdays};
use orasenda_store::StoreError;
use orasenda_store::reflections::ReflectionKind;

use super::NudgeKind;
use super::view::{is_complete, weekly_weekday};
use super::words;
use crate::scheduler::{Host, store_status};
use crate::session::{SessionService, lock};

const MINUTE_MS: u64 = 60_000;

/// A nudge that is due now: its kind and the local date it is for.
type Pending = (NudgeKind, LocalDate);

/// Posts the review nudge that became due, once per new local minute. `routine_posted` is
/// whether the routines' nudge posted this tick. The service lock is never held while the
/// notifier is asked or posts.
pub fn nudge_due<H: Host>(host: &H, routine_posted: bool) {
    let Some(service) = host.service() else {
        return;
    };
    let Some((kind, day)) = lock(service).review_nudge_due(host.now_ms(), routine_posted) else {
        return;
    };
    let notifier = host.notifier();
    let status = notifier.status();
    store_status(host, status);
    if status != NotificationStatus::Granted {
        return;
    }
    if !lock(service).review.nudge.nudged.insert((kind, day)) {
        return;
    }
    let body = match kind {
        NudgeKind::Shutdown => words::nudge_shutdown(),
        NudgeKind::Weekly => words::nudge_weekly(),
    };
    if let Err(error) = notifier.post(body, "") {
        eprintln!("review: could not post the {kind:?} nudge ({error})");
    }
}

impl SessionService {
    /// The nudge to post at `now_ms`, worked out once per new minute. The kinds that give way
    /// (the shutdown when the weekly one is due, or both when a routine nudge posted) are
    /// marked here; the one returned is marked once it is posted, so a status allowed later
    /// inside the window still posts. A failed read is logged and gives none; the next minute,
    /// still inside the window, tries again.
    pub(crate) fn review_nudge_due(
        &mut self,
        now_ms: u64,
        routine_posted: bool,
    ) -> Option<Pending> {
        let minute = now_ms / MINUTE_MS;
        if self.review.nudge.minute == Some(minute) {
            return None;
        }
        self.review.nudge.minute = Some(minute);
        let settings = self.settings();
        if !settings.notify_shutdown_due && !settings.notify_weekly_review {
            return None;
        }
        let local = self.routines_local(now_ms);
        let today = local.today;
        // Yesterday's marks can't match again.
        self.review.nudge.nudged.retain(|(_, day)| *day == today);
        // The stored time is already read within 240..=1439 (default 1050).
        let time = settings.review_shutdown_time;
        let minute_of_day = minute_of_day(now_ms, local.offset_min);
        let window = |days: Weekdays, kind: NudgeKind| {
            let nudged = self.review.nudge.nudged.contains(&(kind, today));
            due_now(
                Some(time),
                days,
                today.weekday(),
                minute_of_day,
                false,
                nudged,
            )
        };
        let mut shutdown =
            settings.notify_shutdown_due && window(Weekdays::WEEKDAYS, NudgeKind::Shutdown);
        let mut weekly = settings.notify_weekly_review
            && Weekdays::from_bits(weekly_weekday(settings.review_weekly_day).bit())
                .is_some_and(|days| window(days, NudgeKind::Weekly));
        if !shutdown && !weekly {
            return None;
        }
        let (done, planned) = match self.review_complete(today) {
            Ok(complete) => complete,
            Err(error) => {
                eprintln!("review: could not read the reflections for the nudge ({error})");
                return None;
            }
        };
        shutdown &= !done;
        weekly &= !planned;
        let marks = &mut self.review.nudge.nudged;
        if weekly && shutdown {
            marks.insert((NudgeKind::Shutdown, today));
            shutdown = false;
        }
        let kind = if weekly {
            NudgeKind::Weekly
        } else if shutdown {
            NudgeKind::Shutdown
        } else {
            return None;
        };
        if routine_posted {
            marks.insert((kind, today));
            return None;
        }
        Some((kind, today))
    }

    /// Whether today's shutdown and the planned week are complete.
    fn review_complete(&self, today: LocalDate) -> Result<(bool, bool), StoreError> {
        let store = self.store().ok_or(StoreError::Closed)?;
        store.read(|txn| {
            Ok((
                is_complete(txn, ReflectionKind::Shutdown, today)?,
                is_complete(txn, ReflectionKind::Week, planned_week(today))?,
            ))
        })
    }
}
