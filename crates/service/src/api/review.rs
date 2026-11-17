//! Reviews as the webview sees them (spec 2026-11-16, §Service and IPC). Rust words every
//! `line`, `label` and `spoken` (ADR-011); the webview never assembles one. Nothing here is
//! a score: a reflection is shown back as the person's own words.

use serde::{Deserialize, Serialize};

use super::HabitDotView;

/// The Review page's overview: today's shutdown, the planned week, and which one leads.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReviewView {
    pub today: ShutdownStatus,
    pub week: WeekStatus,
    pub primary: ReviewPrimary,
}

/// Which flow the overview offers first: the weekly review from the weekly day until the end
/// of the planned week's Monday while it has no completed review, else the shutdown while the
/// shutdown day's isn't complete, else neither.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ReviewPrimary {
    Shutdown,
    Weekly,
    None,
}

/// The shutdown day's state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ShutdownStatus {
    /// The shutdown day, `YYYY-MM-DD` (the 04:00 rule).
    pub day: String,
    /// "Monday 16 November".
    pub day_label: String,
    pub done: bool,
    /// "Ready when you are." or "Shutdown complete at 17:42."
    pub line: String,
}

/// The planned week's state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WeekStatus {
    /// The planned week's Monday, `YYYY-MM-DD`.
    pub week_start: String,
    /// "Planning the week of 23 November".
    pub label: String,
    /// Its weekly review is complete.
    pub planned: bool,
    pub line: String,
    pub priorities: Vec<PriorityView>,
}

/// A weekly priority: a live task. A removed task is left out; a Done task reads "Done".
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PriorityView {
    pub task_id: String,
    pub title: String,
    pub done: bool,
    /// "Fix sync bug · Doing".
    pub line: String,
}

/// The guided shutdown.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ShutdownView {
    pub day: String,
    pub day_label: String,
    pub unfinished: Vec<UnfinishedTask>,
    /// The current week's priorities (`week_start(today)`), not the planned week's.
    pub tomorrow: Vec<String>,
    pub answers: ShutdownAnswers,
    pub completed_line: Option<String>,
}

/// A task still in Today or Doing at shutdown.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct UnfinishedTask {
    pub id: String,
    pub title: String,
    pub lane_label: String,
    /// A session is running on it.
    pub active: bool,
}

/// The shutdown's three optional prompts. Also the argument of `shutdown_complete`: the
/// service trims, and an absent or empty field is written as NULL.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ShutdownAnswers {
    pub went_well: Option<String>,
    pub to_improve: Option<String>,
    pub outside_control: Option<String>,
}

/// The weekly review: the look-back and the plan.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyView {
    pub week_start: String,
    pub label: String,
    pub look_back: LookBack,
    pub answers: WeeklyAnswers,
    /// The previous week's improvement, shown back as written.
    pub last_improvement: Option<String>,
    pub completed_line: Option<String>,
}

/// What the weekly review answered so far; typed priorities are already tasks here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyAnswers {
    pub improvement: Option<String>,
    pub notes: Option<String>,
    pub priorities: Vec<PriorityView>,
}

/// The week just worked, in words and small shapes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LookBack {
    /// "Monday 16 to Friday 20 November".
    pub heading: String,
    pub focus_line: String,
    pub days: Vec<BarView>,
    pub goal: Option<GoalView>,
    /// The top 5 tasks by focus time.
    pub tasks: Vec<BarView>,
    pub tasks_line: String,
    pub routine_lines: Vec<String>,
    pub habit_lines: Vec<String>,
    pub estimate_line: Option<String>,
    pub reflections: Vec<ReflectionEcho>,
}

/// A day's shutdown answers, shown back as the person's own words.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ReflectionEcho {
    pub day_label: String,
    pub lines: Vec<String>,
}

/// The range a Stats view covers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum StatsRange {
    Week,
    Weeks8,
    Months6,
}

/// Neutral stats: words first, every number also a sentence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StatsView {
    pub range: StatsRange,
    pub summary: Vec<String>,
    pub bars: Vec<BarView>,
    /// The weekly goal: the week's total on Week, a tick per week on 8 weeks, `None` on 6
    /// months and when no goal is set.
    pub goal: Option<GoalView>,
    pub routines: Vec<String>,
    pub habits: Vec<HabitStat>,
    pub estimate_line: Option<String>,
    pub buffer: Option<BufferSuggestionView>,
    /// Says plainly that the range has nothing in it, without naming or counting a gap.
    pub empty: Option<String>,
}

/// One habit's line, with its dot grid on the Week range only.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct HabitStat {
    pub name: String,
    pub line: String,
    pub dots: Option<Vec<HabitDotView>>,
}

/// The estimate buffer suggestion; never applied by itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BufferSuggestionView {
    /// 25 to 50, in steps of 5.
    pub percent: u8,
    pub line: String,
    /// "Use 40%".
    pub action: String,
}

/// One bar: a day, a week, a month or a task.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BarView {
    /// "Tue", "16 Nov" or "Oct".
    pub label: String,
    /// "Tuesday 17 November, 2 hours 10 minutes" or "Saturday 21 November, nothing recorded".
    pub spoken: String,
    pub minutes: u32,
    /// "2h 10m"; empty when none.
    pub duration: String,
    pub current: bool,
    /// No focus, or a future day.
    pub empty: bool,
}

/// The weekly focus goal against what was focused.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GoalView {
    pub minutes: u32,
    /// "Goal 12h".
    pub words: String,
    /// "You reached your 12h goal." or "9h 40m of a 12h goal."
    pub line: String,
}

/// The weekly review's draft: the full state, written as is.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WeeklyDraft {
    pub improvement: Option<String>,
    pub notes: Option<String>,
    /// 0 to 3, in order.
    pub priorities: Vec<PriorityPick>,
}

/// A priority: a task on the board, or a new title that becomes a Backlog task once.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum PriorityPick {
    Task(String),
    NewTitle(String),
}

/// A shutdown move that can be undone for 10 minutes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MoveUndo {
    pub token: String,
    pub line: String,
}

/// Why a review command did nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ReviewError {
    /// No such task, or nothing to undo.
    NotFound,
    /// A text is over its limit.
    TooLong,
    /// A fourth priority.
    Full,
    /// A blank new title.
    Empty,
    /// The review is for an earlier day: "This review is for an earlier day. Open Review again
    /// to see today."
    Period,
    /// The store is unavailable or the write failed.
    Store,
}
