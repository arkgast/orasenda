//! Where tasks to import come from: Apple Reminders and Things (ADR-010 traits and pure
//! types). The OS-specific crate implements them; core never touches an OS API.

use super::PlatformError;

/// Whether the app may read a source, asked of the OS and never stored.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceAccess {
    NotAsked,
    Granted,
    Denied,
    /// This platform, or this build, cannot read the source.
    Unavailable,
}

/// A due date as the source holds it. Either part may be missing.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct DueParts {
    /// `YYYY-MM-DD`.
    pub date: Option<String>,
    /// `HH:MM`, 24-hour.
    pub time: Option<String>,
}

/// One open reminder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReminderItem {
    /// The origin key: the external id, else `local-<calendarItemIdentifier>`.
    pub id: String,
    pub title: String,
    pub notes: String,
    pub url: String,
    /// The list's title.
    pub list: String,
    /// 0 none, 1 to 9 as Reminders stores it (1 is the highest).
    pub priority: u8,
    pub due: Option<DueParts>,
    pub recurring: bool,
    pub created_ms: Option<u64>,
}

/// Reads open reminders. Neither `request` nor `read` may run on the main thread.
pub trait RemindersSource: Send + Sync {
    /// The OS's current answer, without asking the user.
    fn access(&self) -> SourceAccess;
    /// Asks the user and waits for the answer.
    fn request(&self) -> SourceAccess;
    /// Open reminders; an error when access is missing or the read fails.
    fn read(&self) -> Result<Vec<ReminderItem>, PlatformError>;
    /// Opens the OS pane for this permission.
    fn open_settings(&self) -> Result<(), PlatformError>;
}

/// Why Things could not be read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ThingsReadError {
    Denied,
    NotInstalled,
    TimedOut,
    TooLarge,
    Failed(String),
}

/// Reads open to-dos from Things.
pub trait ThingsSource: Send + Sync {
    fn installed(&self) -> bool;
    /// The to-dos as JSON text; the service parses it.
    fn read(&self) -> Result<String, ThingsReadError>;
    fn open_settings(&self) -> Result<(), PlatformError>;
}

/// Reminders outside the app bundle, or off macOS: the OS would attribute access to
/// the wrong program, so nothing is read.
#[derive(Debug, Clone, Copy, Default)]
pub struct UnbundledReminders;

impl RemindersSource for UnbundledReminders {
    fn access(&self) -> SourceAccess {
        SourceAccess::Unavailable
    }
    fn request(&self) -> SourceAccess {
        SourceAccess::Unavailable
    }
    fn read(&self) -> Result<Vec<ReminderItem>, PlatformError> {
        Err(PlatformError::Unsupported)
    }
    fn open_settings(&self) -> Result<(), PlatformError> {
        Err(PlatformError::Unsupported)
    }
}

#[cfg(test)]
mod tests;
