//! The seam to the OS: registering a global shortcut. The service never names a plugin.

use std::fmt;

pub use crate::api::ShortcutId;

use super::Accelerator;

/// The system would not register a shortcut.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegisterError {
    pub message: String,
}

impl RegisterError {
    pub fn new(message: impl Into<String>) -> RegisterError {
        RegisterError {
            message: message.into(),
        }
    }
}

impl fmt::Display for RegisterError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

/// Registers global shortcuts with the OS. A press reaches [`KeyboardService::on_pressed`](super::KeyboardService::on_pressed).
///
/// An id may hold two accelerators at once, only while a change is being made: the service
/// registers the new one before it saves, so the old one keeps working until then.
pub trait ShortcutRegistrar: Send + Sync {
    /// Registers `acc` for `id` and leaves any accelerator `id` already holds registered.
    fn register(&self, id: ShortcutId, acc: &Accelerator) -> Result<(), RegisterError>;

    /// Drops the oldest accelerator registered for `id`. A no-op when it holds none.
    fn unregister(&self, id: ShortcutId);
}
