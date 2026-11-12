//! What happened to a session, and which page the shell shows.

use orasenda_core::{EndReason, Phase, SessionId};
use serde::{Deserialize, Serialize};

/// What happened to a session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum MilestoneKind {
    Started,
    Paused,
    Resumed,
    /// The session is over: a focus stopped, a `quick` one done, or a break ended (by time, or
    /// skipped). `phase` and `end_reason` describe its last row.
    Ended,
    Recovered,
    /// Two minutes are left, once per end.
    Warned,
    /// A focus completed and its break began.
    BreakStarted,
    /// "+10 min", manual or an automatic step.
    Extended,
    /// Today's focus passed the deep-hours cap, once, at the end of the session that crossed it.
    CapReached,
}

/// A session milestone, emitted as `timer-milestone`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneEvent {
    pub kind: MilestoneKind,
    pub end_reason: Option<EndReason>,
    pub session_id: Option<SessionId>,
    /// The phase the event happened in (after it, for `breakStarted` and an extension).
    pub phase: Phase,
    /// The session is the built-in two-minute start.
    pub quick: bool,
}

/// A page of the app shell.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum NavigatePage {
    Today,
    Board,
    Calendar,
    Routines,
    Review,
    Settings,
}
