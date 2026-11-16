//! Runs. **Syncable**: every write logs to `change_log` with `entity = "routine_run"` and
//! `entity_id` = the run id. A run freezes its step order (`step_ids`) at start and records
//! each answer in order, so a reload or a second window resumes exactly where it was. A run is
//! open until it ends with an outcome. Runs are never removed.

use super::{ms, opt, opt_ms};
use crate::{Entity, StoreError, Txn, sql_int};
use serde_json::Value;

/// How a run ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RunOutcome {
    /// Every step was answered.
    Finished,
    /// The person ended it, its routine was removed, or the day turned.
    Stopped,
}

impl RunOutcome {
    fn as_str(self) -> &'static str {
        match self {
            RunOutcome::Finished => "finished",
            RunOutcome::Stopped => "stopped",
        }
    }

    fn parse(text: &str) -> Option<RunOutcome> {
        match text {
            "finished" => Some(RunOutcome::Finished),
            "stopped" => Some(RunOutcome::Stopped),
            _ => None,
        }
    }
}

/// The answer to one step.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StepAnswer {
    Done,
    Skipped,
}

impl StepAnswer {
    fn as_str(self) -> &'static str {
        match self {
            StepAnswer::Done => "done",
            StepAnswer::Skipped => "skipped",
        }
    }

    fn parse(text: &str) -> Option<StepAnswer> {
        match text {
            "done" => Some(StepAnswer::Done),
            "skipped" => Some(StepAnswer::Skipped),
            _ => None,
        }
    }
}

/// A run to start. `id` is a UUIDv7 made by the caller; `day` is the local date.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewRun {
    pub id: String,
    pub routine_id: String,
    pub day: String,
    /// The habit ids in run order.
    pub step_ids: Vec<String>,
}

/// A stored run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RunRow {
    pub id: String,
    pub routine_id: String,
    pub day: String,
    pub started_at: u64,
    pub ended_at: Option<u64>,
    pub outcome: Option<RunOutcome>,
    pub steps_total: u16,
    pub steps_done: u16,
    pub steps_skipped: u16,
    pub step_ids: Vec<String>,
    /// One answer per answered step, in step order.
    pub answers: Vec<StepAnswer>,
    pub updated_at: u64,
}

impl RunRow {
    /// Whether the run has not ended yet.
    pub fn is_open(&self) -> bool {
        self.ended_at.is_none()
    }
}

const COLUMNS: &str = "id, routine_id, day, started_at, ended_at, outcome, steps_total,
    steps_done, steps_skipped, step_ids, answers, updated_at";

/// Starts a run at `txn.now_ms()` and logs every field. A `day` that is not `YYYY-MM-DD`, or a
/// repeated id, fails and writes nothing. Whether another run is open is the service's rule.
pub fn start(txn: &mut Txn, run: &NewRun) -> Result<(), StoreError> {
    let now = txn.now_ms();
    let total = u16::try_from(run.step_ids.len())
        .map_err(|_| StoreError::Sqlite("a run has too many steps".into()))?;
    let step_ids = serde_json::to_string(&run.step_ids)?;
    txn.conn().execute(
        "INSERT INTO routine_run (id, routine_id, day, started_at, steps_total, step_ids,
             updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?4)",
        rusqlite::params![
            run.id,
            run.routine_id,
            run.day,
            sql_int(now)?,
            total,
            step_ids
        ],
    )?;
    txn.log_fields(
        Entity::RoutineRun,
        &run.id,
        &[
            ("routine_id", Value::from(run.routine_id.clone())),
            ("day", Value::from(run.day.clone())),
            ("started_at", Value::from(now)),
            ("steps_total", Value::from(total)),
            ("steps_done", Value::from(0)),
            ("steps_skipped", Value::from(0)),
            ("step_ids", Value::from(run.step_ids.clone())),
            ("answers", Value::Array(Vec::new())),
        ],
    )
}

/// The run with `id`.
pub fn get(txn: &Txn, id: &str) -> Result<Option<RunRow>, StoreError> {
    Ok(query(txn, "WHERE id = ?1", [id])?.pop())
}

/// The open run of `routine_id`, if any (the latest started, should there be more).
pub fn open_run(txn: &Txn, routine_id: &str) -> Result<Option<RunRow>, StoreError> {
    Ok(query(
        txn,
        "WHERE routine_id = ?1 AND ended_at IS NULL",
        [routine_id],
    )?
    .pop())
}

/// Every open run, of any routine and any day, oldest first.
pub fn list_open(txn: &Txn) -> Result<Vec<RunRow>, StoreError> {
    query(txn, "WHERE ended_at IS NULL", [])
}

/// Every run on the local date `day`, open or ended, oldest first.
pub fn runs_on(txn: &Txn, day: &str) -> Result<Vec<RunRow>, StoreError> {
    query(txn, "WHERE day = ?1", [day])
}

/// Runs that ended `finished` on a local date in `from_day..=to_day`, oldest first.
pub fn finished_between(
    txn: &Txn,
    from_day: &str,
    to_day: &str,
) -> Result<Vec<RunRow>, StoreError> {
    let _ = (txn, from_day, to_day);
    Ok(Vec::new())
}

/// Records `answer` for the next step of the open run `id`, sets `updated_at`, and logs the
/// changed count and `answers`. Returns the run as it now is, or `None` when the run is
/// missing, ended, or has every step answered; then nothing is written. Ending the run after
/// its last answer is the caller's call to [`end`].
pub fn answer(txn: &mut Txn, id: &str, answer: StepAnswer) -> Result<Option<RunRow>, StoreError> {
    let Some(mut run) = get(txn, id)?.filter(RunRow::is_open) else {
        return Ok(None);
    };
    if run.answers.len() >= run.step_ids.len() {
        return Ok(None);
    }
    run.answers.push(answer);
    let (column, count) = match answer {
        StepAnswer::Done => {
            run.steps_done += 1;
            ("steps_done", run.steps_done)
        }
        StepAnswer::Skipped => {
            run.steps_skipped += 1;
            ("steps_skipped", run.steps_skipped)
        }
    };
    run.updated_at = txn.now_ms();
    let answers = answers_value(&run.answers);
    txn.conn().execute(
        "UPDATE routine_run SET steps_done = ?2, steps_skipped = ?3, answers = ?4,
             updated_at = ?5
         WHERE id = ?1",
        rusqlite::params![
            id,
            run.steps_done,
            run.steps_skipped,
            answers.to_string(),
            sql_int(run.updated_at)?
        ],
    )?;
    txn.log_fields(
        Entity::RoutineRun,
        id,
        &[(column, Value::from(count)), ("answers", answers)],
    )?;
    Ok(Some(run))
}

/// Ends the open run `id` at `txn.now_ms()` with `outcome` and logs `ended_at` and `outcome`.
/// Returns the ended run, or `None` when it is missing or already ended (nothing is written).
pub fn end(txn: &mut Txn, id: &str, outcome: RunOutcome) -> Result<Option<RunRow>, StoreError> {
    let now = txn.now_ms();
    let changed = txn.conn().execute(
        "UPDATE routine_run SET ended_at = ?2, outcome = ?3, updated_at = ?2
         WHERE id = ?1 AND ended_at IS NULL",
        rusqlite::params![id, sql_int(now)?, outcome.as_str()],
    )?;
    if changed == 0 {
        return Ok(None);
    }
    txn.log_fields(
        Entity::RoutineRun,
        id,
        &[
            ("ended_at", Value::from(now)),
            ("outcome", opt(Some(outcome.as_str()))),
        ],
    )?;
    get(txn, id)
}

fn answers_value(answers: &[StepAnswer]) -> Value {
    Value::Array(answers.iter().map(|a| Value::from(a.as_str())).collect())
}

fn query<P: rusqlite::Params>(
    txn: &Txn,
    filter: &str,
    params: P,
) -> Result<Vec<RunRow>, StoreError> {
    let mut stmt = txn.conn().prepare(&format!(
        "SELECT {COLUMNS} FROM routine_run {filter} ORDER BY started_at, id"
    ))?;
    let rows = stmt.query_map(params, read_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn conversion(index: usize, message: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(index, rusqlite::types::Type::Text, message.into())
}

fn read_row(row: &rusqlite::Row) -> rusqlite::Result<RunRow> {
    let outcome = row
        .get::<_, Option<String>>(5)?
        .map(|text| {
            RunOutcome::parse(&text).ok_or_else(|| conversion(5, format!("unknown outcome {text}")))
        })
        .transpose()?;
    let step_ids: String = row.get(9)?;
    let step_ids: Vec<String> = serde_json::from_str(&step_ids)
        .map_err(|err| conversion(9, format!("step_ids are not a list of ids: {err}")))?;
    let answers: String = row.get(10)?;
    let answers: Vec<String> = serde_json::from_str(&answers)
        .map_err(|err| conversion(10, format!("answers are not a list: {err}")))?;
    let answers = answers
        .iter()
        .map(|text| {
            StepAnswer::parse(text).ok_or_else(|| conversion(10, format!("unknown answer {text}")))
        })
        .collect::<rusqlite::Result<_>>()?;
    Ok(RunRow {
        id: row.get(0)?,
        routine_id: row.get(1)?,
        day: row.get(2)?,
        started_at: ms(row, 3)?,
        ended_at: opt_ms(row, 4)?,
        outcome,
        steps_total: row.get(6)?,
        steps_done: row.get(7)?,
        steps_skipped: row.get(8)?,
        step_ids,
        answers,
        updated_at: ms(row, 11)?,
    })
}
