//! The shutdown's Tomorrow step: what tomorrow holds, read from the store and worded by
//! [`words::tomorrow_lines`]. Nothing is invented: a thing the store doesn't hold isn't listed.

use orasenda_core::LocalDate;
use orasenda_core::review::week_start;
use orasenda_store::reflections::{self, ReflectionKind, reflection_id};
use orasenda_store::routines as routine_rows;
use orasenda_store::tasks;
use orasenda_store::{StoreError, Txn};

use super::view::priorities;
use super::words::{self, Tomorrow};
use crate::api::Lane;
use crate::board::view::{lane, planned};
use crate::routines::view::mask;
use crate::session::SessionService;

impl SessionService {
    /// The Tomorrow step's lines for the shutdown of `day`: tomorrow is the day after.
    /// Unavailable or unreadable storage is an error, never an empty day.
    pub(crate) fn tomorrow_lines(
        &self,
        now_ms: u64,
        day: LocalDate,
    ) -> Result<Vec<String>, StoreError> {
        let store = self.store().ok_or(StoreError::Closed)?;
        let local = self.routines_local(now_ms);
        let buffer = self.settings().board_estimate_buffer;
        let tomorrow = store.read(|txn| read(txn, day.succ(), local.today, buffer, local.cycle))?;
        Ok(words::tomorrow_lines(&tomorrow))
    }
}

fn read(
    txn: &Txn,
    tomorrow: LocalDate,
    today: LocalDate,
    buffer: u8,
    cycle: orasenda_core::HourCycle,
) -> Result<Tomorrow, StoreError> {
    let weekday = tomorrow.weekday();
    let mut routines = Vec::new();
    for row in routine_rows::list_live(txn)? {
        if mask(row.fields.days)?.contains(weekday) {
            routines.push((row.fields.time_of_day, row.fields.name));
        }
    }
    // Timed routines in time order, then the ones that can happen any time.
    routines.sort_by_key(|(minute, _)| minute.unwrap_or(u16::MAX));

    let iso = tomorrow.to_iso();
    let live = tasks::list_live(txn)?;
    let due = live
        .iter()
        .filter(|task| lane(&task.lane) != Lane::DONE && task.due.as_deref() == Some(iso.as_str()))
        .map(|task| task.title.clone())
        .collect();
    let planned_sessions = live
        .iter()
        .filter(|task| lane(&task.lane) == Lane::TODAY)
        .filter_map(|task| task.estimate.map(|estimate| planned(estimate, buffer)))
        .sum();

    let week = week_start(today).to_iso();
    let row = reflections::get(txn, &reflection_id(ReflectionKind::Week, &week))?
        .filter(|row| row.deleted_at.is_none());
    let priorities = match row {
        Some(row) => priorities(txn, &row.priorities)?
            .into_iter()
            .map(|view| view.title)
            .collect(),
        None => Vec::new(),
    };
    Ok(Tomorrow {
        day: tomorrow,
        routines,
        due,
        planned_sessions,
        buffer,
        priorities,
        cycle,
    })
}
