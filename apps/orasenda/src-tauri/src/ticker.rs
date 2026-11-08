//! The wall-clock ticker: a Rust thread emits `clock-tick` on every whole second, so the clock
//! keeps time while the webview is hidden or throttled.

use std::{io, thread, time::SystemTime};

use orasenda_core::clock::{delay_to_next_second, epoch_ms};
use tauri::AppHandle;
use tauri_specta::Event;

use crate::ClockTick;

/// Starts the `clock-ticker` thread. It re-reads the wall clock on every iteration, so sleep,
/// clock jumps and NTP corrections realign on the next tick. Fails only when the OS cannot
/// start the thread.
pub fn spawn(app: AppHandle) -> io::Result<()> {
    thread::Builder::new()
        .name("clock-ticker".into())
        .spawn(move || {
            loop {
                thread::sleep(delay_to_next_second(SystemTime::now()));
                emit_now(&app);
            }
        })?;
    Ok(())
}

/// Emits one tick now, read from the wall clock. Errors are logged, never fatal.
pub fn emit_now(app: &AppHandle) {
    let tick = ClockTick {
        epoch_ms: epoch_ms(SystemTime::now()),
    };
    if let Err(error) = tick.emit(app) {
        eprintln!("clock-ticker: could not emit clock-tick: {error}");
    }
}
