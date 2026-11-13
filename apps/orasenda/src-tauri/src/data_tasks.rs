//! The automatic backup check and its single-flight guard. It runs on its own thread at launch
//! and when the main window gains focus; a check already running makes the next one return.

use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;

use orasenda_service::data;
use orasenda_service::scheduler::Host;

use crate::runtime::ticker::AppHost;

/// True while a check runs.
static RUNNING: AtomicBool = AtomicBool::new(false);

/// Puts the flag back down when the work ends, also by a panic.
struct Lowered<'a>(&'a AtomicBool);

impl Drop for Lowered<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// Runs `work` unless another run holds `flag`. True when it ran.
pub(crate) fn single_flight(flag: &AtomicBool, work: impl FnOnce()) -> bool {
    if flag.swap(true, Ordering::SeqCst) {
        return false;
    }
    let _lowered = Lowered(flag);
    work();
    true
}

/// One automatic check on `host`: creates an `auto` backup only when one is due. True when it
/// ran at all (it did not return early on the guard).
pub(crate) fn check<H: Host>(host: &H, flag: &AtomicBool) -> bool {
    single_flight(flag, || {
        data::run_auto_check(host);
    })
}

/// Starts a check on a background thread, unless one is already running.
pub fn spawn_auto_check(app: &tauri::AppHandle) {
    if RUNNING.load(Ordering::SeqCst) {
        return;
    }
    let host = AppHost::new(app);
    if let Err(error) = thread::Builder::new()
        .name("backup-check".into())
        .spawn(move || {
            check(&host, &RUNNING);
        })
    {
        eprintln!("backups: could not start the automatic check ({error})");
    }
}
