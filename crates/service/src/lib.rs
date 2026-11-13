//! The Orasenda session service: the API types the webview sees, the session (the engine, the
//! store and the platform behind one lock, ADR-013) and the scheduler's tick and publish
//! logic behind the [`scheduler::Host`] trait. It holds no Tauri and no OS API: the app
//! crate supplies the host, the thread and the emits.

pub mod api;
pub mod inbox;
pub mod keyboard;
pub mod scheduler;
pub mod session;
pub mod windows;
