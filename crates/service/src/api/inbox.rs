//! The Inbox as the webview sees it: notes captured from anywhere, listed on Board.

use serde::{Deserialize, Serialize};

/// Whether a note is about the user's own work or about something outside it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum NoteKind {
    Internal,
    External,
}

/// A note to save, as typed. The service trims it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NewCapture {
    pub text: String,
    pub kind: NoteKind,
}

/// A live note, with its time already worded in the user's local time zone.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NoteView {
    /// A UUIDv7.
    pub id: String,
    pub text: String,
    pub kind: NoteKind,
    /// The time as shown: "14:32" today, "Yesterday 14:32", "12 Nov 14:32".
    pub created_at: String,
    /// The same time as VoiceOver should say it: "Today at 14:32", "12 November at 14:32".
    pub created_at_label: String,
}

/// Why a capture was not saved.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum CaptureError {
    /// Nothing but whitespace.
    Empty,
    /// More than 1000 characters after trimming.
    TooLong,
    /// The store is unavailable or the write failed.
    Store,
}

/// Why removing or restoring a note failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum InboxError {
    /// No such note, or it is already in the state asked for.
    NotFound,
    /// The store is unavailable or the write failed.
    Store,
}
