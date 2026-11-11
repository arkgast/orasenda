//! What happened to a session, and which page the shell shows.

use orasenda_core::{EndReason, SessionId};
use serde::{Deserialize, Serialize};

/// What happened to a session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum MilestoneKind {
    Started,
    Paused,
    Resumed,
    Ended,
    Recovered,
}

/// A session milestone, emitted as `timer-milestone`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneEvent {
    pub kind: MilestoneKind,
    pub end_reason: Option<EndReason>,
    pub session_id: Option<SessionId>,
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
