//! The five review settings: their keys, reading, range check and saving.

use orasenda_store::{StoreError, Txn, settings};

use super::settings::{read_ranged, read_setting};
use crate::api::{Settings, WeeklyDay};

pub(super) const KEY_GOAL_HOURS: &str = "review.focus_goal_hours";
pub(super) const KEY_SHUTDOWN_DUE: &str = "notify.shutdown_due";
pub(super) const KEY_WEEKLY_REVIEW: &str = "notify.weekly_review";
pub(super) const KEY_SHUTDOWN_TIME: &str = "review.shutdown_time";
pub(super) const KEY_WEEKLY_DAY: &str = "review.weekly_day";

/// The focus goal, in hours; 0 is no goal.
const GOAL_HOURS: std::ops::RangeInclusive<u8> = 0..=60;
/// The shutdown time, in minutes since midnight: 04:00 to 23:59 (ruling G2).
const SHUTDOWN_TIME: std::ops::RangeInclusive<u16> = 240..=1439;

/// The five review values as stored, each already range checked.
pub(super) struct ReviewKeys {
    pub focus_goal_hours: u8,
    pub shutdown_due: bool,
    pub weekly_review: bool,
    pub shutdown_time: u16,
    pub weekly_day: WeeklyDay,
}

/// Reads the review keys. Out-of-range and unknown values read the default.
pub(super) fn read_review(txn: &Txn) -> Result<ReviewKeys, StoreError> {
    let d = Settings::default();
    Ok(ReviewKeys {
        focus_goal_hours: read_ranged(txn, KEY_GOAL_HOURS, d.review_focus_goal_hours, GOAL_HOURS)?,
        shutdown_due: read_setting(txn, KEY_SHUTDOWN_DUE, d.notify_shutdown_due)?,
        weekly_review: read_setting(txn, KEY_WEEKLY_REVIEW, d.notify_weekly_review)?,
        shutdown_time: read_ranged(
            txn,
            KEY_SHUTDOWN_TIME,
            d.review_shutdown_time,
            SHUTDOWN_TIME,
        )?,
        // An unknown day fails to decode, which `read_setting` logs and replaces by the default.
        weekly_day: read_setting::<WeeklyDay>(txn, KEY_WEEKLY_DAY, d.review_weekly_day)?,
    })
}

/// Why the review keys of `new` can't be saved, if they can't.
pub(super) fn invalid_review(new: &Settings) -> Option<&'static str> {
    if !GOAL_HOURS.contains(&new.review_focus_goal_hours) {
        return Some("the focus goal can be 0 to 60 hours");
    }
    if !SHUTDOWN_TIME.contains(&new.review_shutdown_time) {
        return Some("the shutdown time can be from 04:00 to 23:59");
    }
    None
}

/// Writes the review keys of `new` that differ from `presented`.
pub(super) fn write_review(
    txn: &mut Txn,
    presented: &Settings,
    new: &Settings,
) -> Result<(), StoreError> {
    if new.review_focus_goal_hours != presented.review_focus_goal_hours {
        settings::set(txn, KEY_GOAL_HOURS, &new.review_focus_goal_hours)?;
    }
    if new.notify_shutdown_due != presented.notify_shutdown_due {
        settings::set(txn, KEY_SHUTDOWN_DUE, &new.notify_shutdown_due)?;
    }
    if new.notify_weekly_review != presented.notify_weekly_review {
        settings::set(txn, KEY_WEEKLY_REVIEW, &new.notify_weekly_review)?;
    }
    if new.review_shutdown_time != presented.review_shutdown_time {
        settings::set(txn, KEY_SHUTDOWN_TIME, &new.review_shutdown_time)?;
    }
    if new.review_weekly_day != presented.review_weekly_day {
        settings::set(txn, KEY_WEEKLY_DAY, &new.review_weekly_day)?;
    }
    Ok(())
}

/// Copies the fields `write_review` wrote into the cache.
pub(super) fn merge_review(cache: &mut Settings, presented: &Settings, new: &Settings) {
    if new.review_focus_goal_hours != presented.review_focus_goal_hours {
        cache.review_focus_goal_hours = new.review_focus_goal_hours;
    }
    if new.notify_shutdown_due != presented.notify_shutdown_due {
        cache.notify_shutdown_due = new.notify_shutdown_due;
    }
    if new.notify_weekly_review != presented.notify_weekly_review {
        cache.notify_weekly_review = new.notify_weekly_review;
    }
    if new.review_shutdown_time != presented.review_shutdown_time {
        cache.review_shutdown_time = new.review_shutdown_time;
    }
    if new.review_weekly_day != presented.review_weekly_day {
        cache.review_weekly_day = new.review_weekly_day;
    }
}
