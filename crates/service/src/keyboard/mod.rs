//! The global shortcuts: parsing, registering before saving, and what a press does.
//!
//! The service holds no plugin: a [`ShortcutRegistrar`] does the OS part (spec: Hotkeys and
//! capture, ADR-017). `src-tauri` supplies the registrar and calls [`KeyboardService::on_pressed`].

mod accelerator;
mod registrar;
mod service;
#[cfg(any(test, feature = "test-support"))]
#[path = "tests.rs"]
pub mod test_support;

pub use accelerator::{Accelerator, ParseError, is_menu_shortcut};
pub use registrar::{RegisterError, ShortcutId, ShortcutRegistrar};
pub use service::{CaptureOpener, KeyboardService, shortcut_view};
