//! The Review overview: today's shutdown, the planned week, and which one leads.

use orasenda_core::review::{look_back, planned_week, shutdown_day};
use orasenda_core::{HourCycle, LocalDate, Weekday};
use orasenda_store::reflections::{self, ReflectionKind, ReflectionRow, reflection_id};
use orasenda_store::tasks::{self, TaskRow};
use orasenda_store::{StoreError, Txn};

use super::words;
use crate::api::{
    Lane, PriorityView, ReviewError, ReviewPrimary, ReviewView, ShutdownStatus, WeekStatus,
    WeeklyDay,
};
use crate::board::columns;
use crate::scheduler::Host;
use crate::session::{SessionService, lock};

/// `review_get`: the overview now.
pub fn run_review_get<H: Host>(host: &H) -> Result<ReviewView, ReviewError> {
    let service = host.service().ok_or(ReviewError::Store)?;
    lock(service).review_view(host.now_ms())
}

impl SessionService {
    /// The overview at `now_ms`. Unavailable or unreadable storage answers `Store`.
    pub(crate) fn review_view(&self, now_ms: u64) -> Result<ReviewView, ReviewError> {
        let store = self.store().ok_or(ReviewError::Store)?;
        let local = self.routines_local(now_ms);
        let when = When {
            now_ms,
            today: local.today,
            offset_min: local.offset_min,
            cycle: local.cycle,
        };
        let weekly_day = self.settings().review_weekly_day;
        store
            .read(|txn| build(txn, when, weekly_day))
            .map_err(|error| {
                eprintln!("review: could not read the overview ({error})");
                ReviewError::Store
            })
    }

    /// The view for `review-changed` when this tick's local date or shutdown day differs from
    /// the last recorded ones (midnight or 04:00 passed). The first tick only records them, and
    /// they are recorded only once the view was read, so a failed read retries on the next tick.
    pub(crate) fn review_day_view(&mut self, now_ms: u64) -> Option<ReviewView> {
        let local = self.routines_local(now_ms);
        let today = local.today;
        let shutdown = shutdown_day(now_ms, local.offset_min);
        let marks = self.review.day;
        if marks.today.is_none() {
            self.review.day.today = Some(today);
            self.review.day.shutdown = Some(shutdown);
            return None;
        }
        if marks.today == Some(today) && marks.shutdown == Some(shutdown) {
            return None;
        }
        let view = super::emit::changed_view(self, now_ms)?;
        self.review.day.today = Some(today);
        self.review.day.shutdown = Some(shutdown);
        Some(view)
    }
}

/// The moment the overview is built for.
#[derive(Clone, Copy)]
struct When {
    now_ms: u64,
    today: LocalDate,
    offset_min: i32,
    cycle: HourCycle,
}

fn build(txn: &Txn, local: When, weekly_day: WeeklyDay) -> Result<ReviewView, StoreError> {
    let day = shutdown_day(local.now_ms, local.offset_min);
    let planned = planned_week(local.today);
    let shutdown_row = live(reflections::get(
        txn,
        &reflection_id(ReflectionKind::Shutdown, &day.to_iso()),
    )?);
    let week_row = live(reflections::get(
        txn,
        &reflection_id(ReflectionKind::Week, &planned.to_iso()),
    )?);
    let completed = shutdown_row.as_ref().and_then(|row| row.completed_at);
    let done = completed.is_some();
    let week_planned = week_row
        .as_ref()
        .is_some_and(|row| row.completed_at.is_some());
    let line = words::shutdown_line(
        completed.map(|at| local_minute(at, local.offset_min)),
        local.cycle,
    );
    let priorities = match &week_row {
        Some(row) => priorities(txn, &row.priorities)?,
        None => Vec::new(),
    };
    Ok(ReviewView {
        today: ShutdownStatus {
            day: day.to_iso(),
            day_label: words::day_label(day),
            done,
            line,
        },
        week: WeekStatus {
            week_start: planned.to_iso(),
            label: words::week_label(planned),
            planned: week_planned,
            line: words::week_line(week_planned).to_owned(),
            priorities,
        },
        primary: primary(local.today, weekly_day, week_planned, done),
    })
}

/// Weekly from the weekly day until the end of the planned week's Monday while that week has
/// no completed review; else shutdown while the shutdown day's isn't complete; else none.
/// With Monday as the weekly day, weekly is Monday only.
fn primary(today: LocalDate, weekly_day: WeeklyDay, planned: bool, done: bool) -> ReviewPrimary {
    let weekday = today.weekday();
    let from = match weekly_day {
        WeeklyDay::Fri => Weekday::Friday,
        WeeklyDay::Sat => Weekday::Saturday,
        WeeklyDay::Sun => Weekday::Sunday,
        WeeklyDay::Mon => Weekday::Monday,
    };
    let due = weekday == Weekday::Monday || (from != Weekday::Monday && weekday >= from);
    if due && !planned {
        ReviewPrimary::Weekly
    } else if !done {
        ReviewPrimary::Shutdown
    } else {
        ReviewPrimary::None
    }
}

/// The priorities that are still live tasks, in saved order. A removed task is left out.
fn priorities(txn: &Txn, ids: &[String]) -> Result<Vec<PriorityView>, StoreError> {
    let names = columns::read(txn)?;
    let mut views = Vec::new();
    for id in ids {
        let Some(task) = tasks::get(txn, id)?.filter(|task: &TaskRow| task.deleted_at.is_none())
        else {
            continue;
        };
        let lane_id = crate::board::view::lane(task.lane);
        let done = lane_id == Lane::Done;
        let lane = names
            .iter()
            .find(|column| column.lane == lane_id)
            .map_or("", |column| column.name.as_str());
        views.push(PriorityView {
            line: words::priority_line(&task.title, lane, done),
            task_id: task.id,
            title: task.title,
            done,
        });
    }
    Ok(views)
}

fn live(row: Option<ReflectionRow>) -> Option<ReflectionRow> {
    row.filter(|row| row.deleted_at.is_none())
}

/// The minute of the local day (0 to 1439) of `epoch_ms`.
fn local_minute(epoch_ms: u64, offset_min: i32) -> u16 {
    let minutes = i64::try_from(epoch_ms / 60_000).unwrap_or(0) + i64::from(offset_min);
    u16::try_from(minutes.rem_euclid(24 * 60)).unwrap_or(0)
}

/// Accepts the current period and the one just before it; anything older answers `Period`
/// (its line is [`words::period_line`]). For a shutdown, the periods are the shutdown day and
/// the day before it; for a week, the planned week and the week before it.
pub fn check_period(
    kind: ReflectionKind,
    given: &str,
    now_ms: u64,
    offset_min: i32,
) -> Result<(), ReviewError> {
    let (current, previous) = match kind {
        ReflectionKind::Shutdown => {
            let day = shutdown_day(now_ms, offset_min);
            (day, day.pred())
        }
        ReflectionKind::Week => {
            let planned = planned_week(LocalDate::from_epoch_ms(now_ms, offset_min));
            (planned, look_back(planned).0)
        }
    };
    if given == current.to_iso() || given == previous.to_iso() {
        Ok(())
    } else {
        Err(ReviewError::Period)
    }
}
