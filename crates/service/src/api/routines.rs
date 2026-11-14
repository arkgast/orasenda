//! Routines and habits as the webview sees them (spec 2026-11-14, §Service and IPC). Rust words
//! every sentence and time (ADR-011); the webview never assembles one.

use serde::{Deserialize, Serialize};

pub use orasenda_core::TemplateId;

/// Everything the Routines page shows: the routines in order, the standalone habits and the
/// open run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RoutinesView {
    pub routines: Vec<RoutineView>,
    /// The standalone habits, in order.
    pub habits: Vec<HabitView>,
    /// Today's open run, if any (one at a time). A run left open on an earlier day is never
    /// shown: it is closed as `stopped` on the new day.
    pub run: Option<RunView>,
}

/// One routine with its habits (its steps) and today's progress.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RoutineView {
    /// A UUIDv7.
    pub id: String,
    pub name: String,
    /// Minutes after local midnight; `None` is any time.
    pub time_of_day: Option<u16>,
    /// The time worded by the hour cycle: "07:00" or "7:00 AM".
    pub time: Option<String>,
    /// The weekday mask, Monday = 1 … Sunday = 64.
    pub days: u8,
    /// "Every day", "Weekdays", "Weekends" or "Mon, Wed, Fri".
    pub days_label: String,
    /// Copied from a template: the routine shows its wellness note.
    pub wellness: bool,
    /// The wellness note to show, when `wellness`: "Wellness suggestion, not medical advice."
    pub note: Option<String>,
    pub habits: Vec<HabitView>,
    pub today: RoutineToday,
    /// "Not started today", "2 of 5 done today" or "Done today, 4 of 5".
    pub today_line: String,
}

/// How far today's pass through a routine went. Drawn as shape and word.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum RoutineToday {
    NotStarted,
    InProgress,
    Finished,
}

/// One habit: a routine's step or a standalone habit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct HabitView {
    /// A UUIDv7.
    pub id: String,
    /// `None` for a standalone habit.
    pub routine_id: Option<String>,
    pub name: String,
    pub when_text: Option<String>,
    pub where_text: Option<String>,
    pub anchor: Option<String>,
    pub two_minute: Option<String>,
    pub identity: Option<String>,
    pub optional: bool,
    /// A standalone habit's weekday mask; `None` inside a routine.
    pub days: Option<u8>,
    /// A standalone habit's days, worded; `None` inside a routine.
    pub days_label: Option<String>,
    /// "I will drink a glass of water at 7:00 in the kitchen."
    pub intention: String,
    /// "After I wake up, I will drink a glass of water."
    pub anchor_line: Option<String>,
    /// The last 28 local days, oldest first; days before the habit was made are left out.
    pub dots: Vec<HabitDotView>,
    pub done_today: bool,
    /// "5 days kept", from 2 days up.
    pub run_line: Option<String>,
    /// "Two days off. Today is a fresh start."
    pub fresh_start: Option<String>,
}

/// One day in a habit's dot grid.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct HabitDotView {
    pub state: HabitDayState,
    pub today: bool,
    /// The date for VoiceOver: "Monday 9 November".
    pub label: String,
}

/// A day's state in the dot grid. Nothing is ever a miss.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum HabitDayState {
    Done,
    NotDone,
    Rest,
    Upcoming,
}

/// A run, step by step: the open run in [`RoutinesView`], or the run a `run_*` command
/// answered (which may have just ended).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RunView {
    pub id: String,
    pub routine_id: String,
    pub routine_name: String,
    pub steps: Vec<RunStepView>,
    /// The index of the step to answer; `None` once every step is answered.
    pub current: Option<u16>,
    pub done: u16,
    pub skipped: u16,
    pub total: u16,
    pub wellness: bool,
    /// "Step 2 of 5", "Routine finished. 4 of 5 done today." or, when ended early, "Routine
    /// ended. 2 of 5 done today."
    pub line: String,
}

/// One step of a run.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RunStepView {
    pub habit_id: String,
    pub name: String,
    /// The intention, the anchor line, "2-minute version: …" and the identity, as present.
    pub detail: Vec<String>,
    pub optional: bool,
    pub state: StepState,
}

/// A step's state in a run.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum StepState {
    Upcoming,
    Done,
    Skipped,
}

/// The answer to a run's current step.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum StepOutcome {
    /// Checks the step's habit in for today.
    Done,
    /// *Skip for today*: only the run's counts change.
    Skip,
}

/// A routine as typed in its editor. The service trims the name.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RoutineDraft {
    pub name: String,
    /// Minutes after local midnight (0–1439); `None` is any time.
    pub time_of_day: Option<u16>,
    /// The weekday mask (1–127).
    pub days: u8,
}

/// A habit as typed in its editor. The service trims every text, and an empty one becomes
/// `None`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct HabitDraft {
    pub name: String,
    pub when_text: Option<String>,
    pub where_text: Option<String>,
    pub anchor: Option<String>,
    pub two_minute: Option<String>,
    pub identity: Option<String>,
    pub optional: bool,
    /// A standalone habit's weekday mask; ignored inside a routine. `None` is every day.
    pub days: Option<u8>,
}

/// A starter template, for the template dialog.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TemplateView {
    pub id: TemplateId,
    pub name: String,
    pub summary: String,
    /// The time worded by the hour cycle; `None` is any time.
    pub time: Option<String>,
    /// The steps in order, worded: "Electrolytes (optional)",
    /// "Delay caffeine 90–120 minutes (optional). The evidence is contested."
    pub steps: Vec<String>,
    /// The wellness note: "Wellness suggestion, not medical advice."
    pub note: String,
}

/// Why a routines command was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum RoutinesError {
    /// No such live routine or habit, or it is already in the state asked for.
    NotFound,
    /// The name is only whitespace, or no weekday is chosen.
    Empty,
    /// A text is over its limit (80 or 120 characters), or a time or day mask is out of range.
    TooLong,
    /// 30 routines, 20 habits in this routine, or 30 standalone habits already.
    Full,
    /// Another run is open today: end it first.
    Running,
    /// The store is unavailable or failed.
    Store,
}
