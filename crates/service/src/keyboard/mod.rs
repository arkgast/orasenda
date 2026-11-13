//! The global shortcuts: parsing, registering before saving, and what a press does.
//!
//! The service holds no plugin: a [`ShortcutRegistrar`] does the OS part (spec: Hotkeys and
//! capture, ADR-017). `src-tauri` supplies the registrar and calls [`KeyboardService::on_pressed`].

mod accelerator;
mod action;
pub mod conflicts;
pub mod fold;
mod registrar;
pub mod registry;
mod service;
pub mod system_keys;
#[cfg(any(test, feature = "test-support"))]
#[path = "tests.rs"]
pub mod test_support;

pub use accelerator::{Accelerator, ParseError, is_menu_shortcut};
pub use action::{ActionId, Slot, Source};
pub use registrar::{RegisterError, ShortcutId, ShortcutRegistrar};
pub use service::{CaptureOpener, KeyboardService, shortcut_view};

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
