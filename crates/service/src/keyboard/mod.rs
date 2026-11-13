//! The shortcut registry and the global shortcuts: parsing, registering before saving, and the
//! changes to a binding (ADR-017, ADR-020).
//!
//! The service holds no plugin: a [`ShortcutRegistrar`] does the OS part. `src-tauri` supplies
//! the registrar and runs a press through `actions::run`.

mod accelerator;
mod action;
mod binding;
pub mod conflicts;
pub mod fold;
mod registrar;
pub mod registry;
mod service;
pub mod system_keys;
#[cfg(any(test, feature = "test-support"))]
#[path = "tests.rs"]
pub mod test_support;
mod view;

pub use accelerator::{Accelerator, ParseError};
pub use action::{ActionId, Slot, Source};
pub use registrar::{RegisterError, ShortcutRegistrar};
pub use service::{KeyboardService, default_view};

#[cfg(test)]
#[path = "cases_registry.rs"]
mod cases_registry;

#[cfg(test)]
#[path = "cases_system_keys.rs"]
mod cases_system_keys;

#[cfg(test)]
#[path = "cases_fold.rs"]
mod cases_fold;

#[cfg(test)]
#[path = "cases_repair.rs"]
mod cases_repair;
