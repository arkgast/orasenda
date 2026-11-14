//! Routines and habits through the recording host: the commands, the limits, the wording, the
//! dot grid, the events and the failures.

mod day;
mod habits;
mod routines;
mod wire;
mod words;

use std::sync::atomic::Ordering;

use orasenda_core::NotificationStatus;

use crate::api::{HabitDraft, RoutineDraft, RoutinesView};
use crate::session::test_support::{Event, TestHost};

pub(super) const HOUR: u64 = 60 * crate::session::test_support::MINUTE;
pub(super) const DAY: u64 = 24 * HOUR;

/// A fresh install on an in-memory store. Local time is UTC+1 on a 12-hour clock, and `T0`
/// is Saturday 7 November 2026, 01:00 local.
pub(super) fn host() -> TestHost {
    TestHost::fresh(NotificationStatus::NotDetermined)
}

pub(super) fn routine(name: &str) -> RoutineDraft {
    RoutineDraft {
        name: name.into(),
        time_of_day: Some(7 * 60),
        days: 127,
    }
}

pub(super) fn habit(name: &str) -> HabitDraft {
    HabitDraft {
        name: name.into(),
        when_text: None,
        where_text: None,
        anchor: None,
        two_minute: None,
        identity: None,
        optional: false,
        days: None,
    }
}

/// Every `routines-changed` view so far, taken from the log.
pub(super) fn changed(host: &TestHost) -> Vec<RoutinesView> {
    host.log()
        .take()
        .into_iter()
        .filter_map(|event| match event {
            Event::RoutinesChanged(view) => Some(view),
            _ => None,
        })
        .collect()
}

/// How many host hooks ran while the service was locked.
pub(super) fn under_lock(host: &TestHost) -> usize {
    host.0.under_lock.load(Ordering::SeqCst)
}
