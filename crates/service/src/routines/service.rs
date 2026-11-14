//! The store side of routines and habits, run under the service lock: the drafts' checks, the
//! limits, and each write in one transaction.

use orasenda_core::routines::templates;
use orasenda_core::{LocalDate, TemplateId, Weekdays};
use orasenda_store::routines::habit_checks;
use orasenda_store::routines::habits::{self, HabitFields, NewHabit};
use orasenda_store::routines::{self as routine_rows, NewRoutine, RoutineFields};
use orasenda_store::{StoreError, Txn};
use uuid::Uuid;

use super::view::{self, Local};
use crate::api::{HabitDraft, RoutineDraft, RoutinesError, RoutinesView};
use crate::session::SessionService;

/// The most live routines.
pub const MAX_ROUTINES: usize = 30;
/// The most live habits in one routine.
pub const MAX_ROUTINE_HABITS: usize = 20;
/// The most live standalone habits.
pub const MAX_STANDALONE_HABITS: usize = 30;
/// The longest name, *when* and *where*, in characters after trimming.
pub const MAX_SHORT: usize = 80;
/// The longest anchor, 2-minute version and identity, in characters after trimming.
pub const MAX_LONG: usize = 120;
const LAST_MINUTE: u16 = 24 * 60 - 1;

/// A write's answer: the value, or why it was refused before anything was written.
pub type Answer<T> = Result<Result<T, RoutinesError>, StoreError>;

impl SessionService {
    /// The local date, offset and hour cycle at `now_ms`.
    pub(crate) fn routines_local(&self, now_ms: u64) -> Local {
        let local = self.local_time();
        let offset_min = local.utc_offset_min(now_ms);
        Local {
            today: LocalDate::from_epoch_ms(now_ms, offset_min),
            offset_min,
            cycle: local.hour_cycle(),
        }
    }

    /// The Routines page's view at `now_ms`.
    pub(crate) fn routines_view(&self, now_ms: u64) -> Result<RoutinesView, StoreError> {
        let store = self.store().ok_or_else(unavailable)?;
        let local = self.routines_local(now_ms);
        let rows = store.read(|txn| view::read(txn, local))?;
        view::build(&rows, local)
    }

    /// Runs `op` in one write at `now_ms`. Returns its value and, when the write committed and
    /// the read-back worked, the view for `routines-changed`. A refusal writes nothing.
    pub(crate) fn routines_write<T>(
        &self,
        now_ms: u64,
        op: impl FnOnce(&mut Txn, Local) -> Answer<T>,
    ) -> Result<(T, Option<RoutinesView>), RoutinesError> {
        let store = self.store().ok_or(RoutinesError::Store)?;
        let local = self.routines_local(now_ms);
        let value = store
            .write(now_ms, |txn| op(txn, local))
            .map_err(|error| {
                eprintln!("routines: could not write ({error})");
                RoutinesError::Store
            })??;
        Ok((value, super::changed_view(self, now_ms)))
    }

    /// The view for `routines-changed` when this tick's local date differs from the last
    /// recorded one (a local midnight passed). The first tick only records the date. The new
    /// date is recorded only once the view was read, so a failed read retries on the next tick.
    /// On a new date (the first tick included), runs left open on an earlier day are closed as
    /// `stopped` first.
    pub(crate) fn routines_day_view(&mut self, now_ms: u64) -> Option<RoutinesView> {
        let today = self.routines_local(now_ms).today;
        if self.routines_day != Some(today) {
            self.close_stale_runs(now_ms, today);
        }
        match self.routines_day {
            None => {
                self.routines_day = Some(today);
                None
            }
            Some(last) if last == today => None,
            Some(_) => {
                let view = super::changed_view(self, now_ms)?;
                self.routines_day = Some(today);
                Some(view)
            }
        }
    }
}

impl SessionService {
    /// Closes runs left open on an earlier day. A failure is logged; the run commands close
    /// them again before they act, and the view never shows another day's run.
    fn close_stale_runs(&self, now_ms: u64, today: LocalDate) {
        let Some(store) = self.store() else {
            return;
        };
        // A read first, so a day with nothing to close writes nothing.
        let day = today.to_iso();
        let stale = store.read(|txn| {
            Ok(orasenda_store::routines::routine_runs::list_open(txn)?
                .iter()
                .any(|run| run.day != day))
        });
        match stale {
            Ok(false) => return,
            Ok(true) => {}
            Err(error) => {
                eprintln!("routines: could not read the open runs ({error})");
                return;
            }
        }
        if let Err(error) = store.write(now_ms, |txn| super::run::close_stale(txn, today)) {
            eprintln!("routines: could not close an earlier day's run ({error})");
        }
    }
}

/// Saves a new routine at the end of the list. Refuses with `Full` at 30.
pub fn create_routine(
    txn: &mut Txn,
    fields: RoutineFields,
    template: Option<TemplateId>,
) -> Answer<String> {
    if routine_rows::list_live(txn)?.len() >= MAX_ROUTINES {
        return Ok(Err(RoutinesError::Full));
    }
    let id = new_id();
    let routine = NewRoutine {
        id: id.clone(),
        fields,
        template: template.map(|id| id.as_str().to_owned()),
        position: routine_rows::next_position(txn)?,
    };
    routine_rows::insert(txn, &routine)?;
    Ok(Ok(id))
}

/// Copies template `id` into a new routine with one habit per step.
pub fn add_template(txn: &mut Txn, id: TemplateId) -> Answer<String> {
    let template = templates::get(id);
    let fields = RoutineFields {
        name: template.name.to_owned(),
        time_of_day: template.time_of_day,
        days: template.days.bits(),
    };
    let routine_id = match create_routine(txn, fields, Some(id))? {
        Ok(routine_id) => routine_id,
        Err(refused) => return Ok(Err(refused)),
    };
    for (position, step) in (0u32..).zip(template.steps) {
        let habit = NewHabit {
            id: new_id(),
            routine_id: Some(routine_id.clone()),
            position,
            fields: HabitFields {
                name: step.name.to_owned(),
                when_text: None,
                where_text: None,
                anchor: step.anchor.map(str::to_owned),
                two_minute: step.two_minute.map(str::to_owned),
                identity: step.identity.map(str::to_owned),
                optional: step.optional,
                days: None,
            },
        };
        habits::insert(txn, &habit)?;
    }
    Ok(Ok(routine_id))
}

/// Brings a removed routine back with its habits. Refuses with `Full` at 30.
pub fn restore_routine(txn: &mut Txn, id: &str) -> Answer<()> {
    if routine_rows::list_live(txn)?.len() >= MAX_ROUTINES {
        return Ok(Err(RoutinesError::Full));
    }
    found(routine_rows::restore(txn, id)?)
}

/// Saves a new habit at the end of its routine (live) or of the standalone list.
pub fn create_habit(txn: &mut Txn, routine_id: Option<&str>, draft: &HabitDraft) -> Answer<String> {
    let fields = match checked_habit(draft, routine_id.is_none()) {
        Ok(fields) => fields,
        Err(refused) => return Ok(Err(refused)),
    };
    if let Some(refused) = room_for_habit(txn, routine_id)? {
        return Ok(Err(refused));
    }
    let id = new_id();
    let habit = NewHabit {
        id: id.clone(),
        routine_id: routine_id.map(str::to_owned),
        position: habits::next_position(txn, routine_id)?,
        fields,
    };
    habits::insert(txn, &habit)?;
    Ok(Ok(id))
}

/// Saves a live habit's fields.
pub fn update_habit(txn: &mut Txn, id: &str, draft: &HabitDraft) -> Answer<()> {
    let Some(habit) = habits::get(txn, id)?.filter(|row| row.deleted_at.is_none()) else {
        return Ok(Err(RoutinesError::NotFound));
    };
    match checked_habit(draft, habit.routine_id.is_none()) {
        Ok(fields) => found(habits::update(txn, id, &fields)?),
        Err(refused) => Ok(Err(refused)),
    }
}

/// Brings a removed habit back, when its routine is live and has room.
pub fn restore_habit(txn: &mut Txn, id: &str) -> Answer<()> {
    let Some(habit) = habits::get(txn, id)?.filter(|row| row.deleted_at.is_some()) else {
        return Ok(Err(RoutinesError::NotFound));
    };
    if let Some(refused) = room_for_habit(txn, habit.routine_id.as_deref())? {
        return Ok(Err(refused));
    }
    found(habits::restore(txn, id)?)
}

/// Checks a live habit in for `today` (`done`), or removes today's check-in. Both are
/// idempotent.
pub fn check_habit(txn: &mut Txn, id: &str, done: bool, today: LocalDate) -> Answer<()> {
    if habits::get(txn, id)?.is_none_or(|row| row.deleted_at.is_some()) {
        return Ok(Err(RoutinesError::NotFound));
    }
    let day = today.to_iso();
    if done {
        habit_checks::check_in(txn, id, &day)?;
    } else {
        habit_checks::remove(txn, id, &day)?;
    }
    Ok(Ok(()))
}

/// `NotFound` for a routine that is not live, or `Full` for a list at its limit.
fn room_for_habit(
    txn: &Txn,
    routine_id: Option<&str>,
) -> Result<Option<RoutinesError>, StoreError> {
    if let Some(routine) = routine_id
        && routine_rows::get(txn, routine)?.is_none_or(|row| row.deleted_at.is_some())
    {
        return Ok(Some(RoutinesError::NotFound));
    }
    let limit = match routine_id {
        Some(_) => MAX_ROUTINE_HABITS,
        None => MAX_STANDALONE_HABITS,
    };
    Ok((habits::list_live(txn, routine_id)?.len() >= limit).then_some(RoutinesError::Full))
}

/// `Ok` when the repository found the row, `NotFound` when it did not.
pub fn found(changed: bool) -> Answer<()> {
    Ok(if changed {
        Ok(())
    } else {
        Err(RoutinesError::NotFound)
    })
}

/// A routine draft trimmed and checked.
pub fn checked_routine(draft: &RoutineDraft) -> Result<RoutineFields, RoutinesError> {
    let name = required(&draft.name)?;
    if draft.days == 0 {
        return Err(RoutinesError::Empty);
    }
    if Weekdays::from_bits(draft.days).is_none()
        || draft.time_of_day.is_some_and(|m| m > LAST_MINUTE)
    {
        return Err(RoutinesError::TooLong);
    }
    Ok(RoutineFields {
        name,
        time_of_day: draft.time_of_day,
        days: draft.days,
    })
}

/// A habit draft trimmed and checked. A standalone habit with no days runs every day; a habit
/// in a routine never keeps days of its own.
pub fn checked_habit(draft: &HabitDraft, standalone: bool) -> Result<HabitFields, RoutinesError> {
    // Ruling 5's order: name, when, where, anchor, 2-minute version, identity, then days.
    let name = required(&draft.name)?;
    let when_text = optional(draft.when_text.as_deref(), MAX_SHORT)?;
    let where_text = optional(draft.where_text.as_deref(), MAX_SHORT)?;
    let anchor = optional(draft.anchor.as_deref(), MAX_LONG)?;
    let two_minute = optional(draft.two_minute.as_deref(), MAX_LONG)?;
    let identity = optional(draft.identity.as_deref(), MAX_LONG)?;
    let days = if standalone {
        let bits = draft.days.unwrap_or(Weekdays::EVERY_DAY.bits());
        if bits == 0 {
            return Err(RoutinesError::Empty);
        }
        Some(
            Weekdays::from_bits(bits)
                .ok_or(RoutinesError::TooLong)?
                .bits(),
        )
    } else {
        None
    };
    Ok(HabitFields {
        name,
        when_text,
        where_text,
        anchor,
        two_minute,
        identity,
        optional: draft.optional,
        days,
    })
}

/// A name: trimmed, 1 to 80 characters.
fn required(text: &str) -> Result<String, RoutinesError> {
    optional(Some(text), MAX_SHORT)?.ok_or(RoutinesError::Empty)
}

/// A trimmed text of at most `max` characters; an empty one is `None`.
fn optional(text: Option<&str>, max: usize) -> Result<Option<String>, RoutinesError> {
    match text.map(str::trim).filter(|text| !text.is_empty()) {
        None => Ok(None),
        Some(text) if text.chars().count() > max => Err(RoutinesError::TooLong),
        Some(text) => Ok(Some(text.to_owned())),
    }
}

fn new_id() -> String {
    Uuid::now_v7().to_string()
}

fn unavailable() -> StoreError {
    StoreError::Sqlite("the store is unavailable".into())
}
