//! What the review keeps in memory between ticks and commands, held in `SessionService` as
//! `review`. Memory only: a relaunch starts every field empty.

use std::collections::BTreeSet;

use orasenda_core::LocalDate;
use orasenda_store::tasks::LaneBefore;

/// The review's memory: the day marks (V10), the one Undo (V16b) and the nudge marks (V21).
// `undo` is filled by V16b; until then nothing reads it.
#[allow(dead_code)]
#[derive(Debug, Default)]
pub(crate) struct ReviewState {
    pub day: DayMarks,
    pub undo: Option<UndoSlot>,
    // Filled by V21; until then nothing reads it.
    #[allow(dead_code)]
    pub nudge: NudgeMarks,
}

/// The dates of the last scheduler tick, so `review-changed` goes out once at local midnight
/// and once at 04:00. The first tick only records them.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub(crate) struct DayMarks {
    /// The local calendar date (midnight moves it).
    pub today: Option<LocalDate>,
    /// The shutdown day (04:00 moves it).
    pub shutdown: Option<LocalDate>,
}

/// The shutdown's last move, undoable for 10 minutes. One at a time; a new move replaces it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct UndoSlot {
    pub token: String,
    pub expires_at: u64,
    pub lanes: Vec<LaneBefore>,
}

/// The nudges already posted, so each goes out once per period. Empty until V21.
#[allow(dead_code)]
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
/// The two review nudges.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum NudgeKind {
    Shutdown,
    Weekly,
}

/// What the nudges remember between ticks, so each kind goes out at most once per day.
#[derive(Debug, Default)]
pub(crate) struct NudgeMarks {
    /// The last minute (since the epoch) the nudges were checked.
    pub minute: Option<u64>,
    /// The kinds nudged, by local date.
    pub nudged: BTreeSet<(NudgeKind, LocalDate)>,
}
