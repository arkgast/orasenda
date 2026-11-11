//! Why a command failed.

use orasenda_core::TimerError;
use serde::{Deserialize, Serialize};

/// Why a notification settings call failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum NotificationsErrorKind {
    Unavailable,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct NotificationsError {
    pub kind: NotificationsErrorKind,
    pub message: String,
}

/// Why a timer command failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum TimerCommandErrorKind {
    AlreadyRunning,
    NothingRunning,
    WrongState,
    InvalidSpec,
    Store,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TimerCommandError {
    pub kind: TimerCommandErrorKind,
    pub message: String,
}

impl From<TimerError> for TimerCommandError {
    fn from(error: TimerError) -> TimerCommandError {
        let kind = match error {
            TimerError::AlreadyRunning => TimerCommandErrorKind::AlreadyRunning,
            TimerError::NothingRunning => TimerCommandErrorKind::NothingRunning,
            TimerError::WrongState => TimerCommandErrorKind::WrongState,
            TimerError::InvalidSpec => TimerCommandErrorKind::InvalidSpec,
        };
        TimerCommandError {
            kind,
            message: error.to_string(),
        }
    }
}

/// Why saving settings failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SettingsErrorKind {
    InvalidSpec,
    Unavailable,
    Write,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SettingsError {
    pub kind: SettingsErrorKind,
    pub message: String,
}
