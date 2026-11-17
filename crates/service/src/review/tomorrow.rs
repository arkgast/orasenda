//! The shutdown's Tomorrow step: what tomorrow holds, read from the store and worded by
//! [`words::tomorrow_lines`]. Nothing is invented: a thing the store doesn't hold isn't listed.

use orasenda_core::review::week_start;
use orasenda_core::{LocalDate, Weekdays};
use orasenda_store::reflections::{self, ReflectionKind, reflection_id};
use orasenda_store::routines as routine_rows;
use orasenda_store::tasks;
use orasenda_store::{StoreError, Txn};

use super::view::priorities;
use super::words::{self, Tomorrow};
use crate::api::Lane;
use crate::board::view::{lane, planned};
use crate::session::SessionService;

impl SessionService {
    /// The Tomorrow step's lines for the shutdown of `day`: tomorrow is the day after.
    /// Unavailable or unreadable storage is an error, never an empty day.
    // V16b calls this from shutdown_get; remove the allow there.
    #[allow(dead_code)]
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
        let days = Weekdays::from_bits(row.fields.days)
            .ok_or_else(|| StoreError::Json("a routine's weekday mask".into()))?;
        // A routine with no time of day has no minute to list.
        if let (true, Some(minute)) = (days.contains(weekday), row.fields.time_of_day) {
            routines.push((minute, row.fields.name));
        }
    }
    routines.sort_by_key(|(minute, _)| *minute);

    let iso = tomorrow.to_iso();
    let live = tasks::list_live(txn)?;
    let due = live
        .iter()
        .filter(|task| lane(task.lane) != Lane::Done && task.due.as_deref() == Some(iso.as_str()))
        .map(|task| task.title.clone())
        .collect();
    let planned_sessions = live
        .iter()
        .filter(|task| lane(task.lane) == Lane::Today)
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
