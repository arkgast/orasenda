//! Things 3 through `osascript` (ADR-010). The script is read-only and addresses Things by
//! bundle id; see `things.js`. Never call `read` on the main thread.

mod stderr;
#[cfg(test)]
mod tests;

use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use objc2_app_kit::NSWorkspace;
use objc2_foundation::{NSString, NSURL};
use orasenda_core::platform::PlatformError;
use orasenda_core::platform::import::{ThingsReadError, ThingsSource};

pub use stderr::error_from_stderr;

/// The script: `function collect(app)` only. Rust appends the caller line.
pub const THINGS_COLLECT_JS: &str = include_str!("../things.js");

const BUNDLE_ID: &str = "com.culturedcode.ThingsMac";
const OSASCRIPT: &str = "/usr/bin/osascript";
const AUTOMATION_PANE: &str =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation";
const TIMEOUT: Duration = Duration::from_secs(120);
const MAX_OUTPUT: usize = 20 * 1024 * 1024;
const MAX_STDERR: u64 = 64 * 1024;

/// Reads open to-dos from Things.
#[derive(Debug, Default, Clone, Copy)]
pub struct MacThings;

impl ThingsSource for MacThings {
    fn installed(&self) -> bool {
        NSWorkspace::sharedWorkspace()
            .URLForApplicationWithBundleIdentifier(&NSString::from_str(BUNDLE_ID))
            .is_some()
    }

    fn read(&self) -> Result<String, ThingsReadError> {
        let script = format!("{THINGS_COLLECT_JS}\ncollect(Application(\"{BUNDLE_ID}\"));\n");
        run(&script, TIMEOUT, MAX_OUTPUT)
    }

    fn open_settings(&self) -> Result<(), PlatformError> {
        let url = NSURL::URLWithString(&NSString::from_str(AUTOMATION_PANE))
            .ok_or_else(|| PlatformError::Other("bad settings url".into()))?;
        if NSWorkspace::sharedWorkspace().openURL(&url) {
            Ok(())
        } else {
            Err(PlatformError::Refused)
        }
    }
}

fn run(script: &str, timeout: Duration, cap: usize) -> Result<String, ThingsReadError> {
    let mut child = Command::new(OSASCRIPT)
        .env_clear()
        .args(["-l", "JavaScript", "-e", script])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| ThingsReadError::Failed(format!("could not start osascript: {e}")))?;
    let too_large = Arc::new(AtomicBool::new(false));
    let out = child
        .stdout
        .take()
        .map(|s| read_capped(s, cap, too_large.clone()));
    let err = child
        .stderr
        .take()
        .map(|s| read_capped(s, MAX_STDERR as usize, Arc::default()));

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) => {}
            Err(e) => {
                stop(&mut child);
                return Err(ThingsReadError::Failed(e.to_string()));
            }
        }
        if too_large.load(Ordering::Relaxed) {
            stop(&mut child);
            return Err(ThingsReadError::TooLarge);
        }
        if started.elapsed() >= timeout {
            stop(&mut child);
            return Err(ThingsReadError::TimedOut);
        }
        thread::sleep(Duration::from_millis(20));
    };
    let stdout = out.map(join).unwrap_or_default();
    let stderr = err.map(join).unwrap_or_default();
    if too_large.load(Ordering::Relaxed) {
        return Err(ThingsReadError::TooLarge);
    }
    match status {
        Some(s) if s.success() => String::from_utf8(stdout).map_err(|_| {
            ThingsReadError::Failed("Things answered with text that is not UTF-8".into())
        }),
        _ => Err(error_from_stderr(&String::from_utf8_lossy(&stderr))),
    }
}

/// Kills the child and reaps it.
fn stop(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn join(handle: JoinHandle<Vec<u8>>) -> Vec<u8> {
    handle.join().unwrap_or_default()
}

/// Reads up to `cap` bytes; one byte more sets `too_large` and stops reading.
fn read_capped<R: Read + Send + 'static>(
    mut source: R,
    cap: usize,
    too_large: Arc<AtomicBool>,
) -> JoinHandle<Vec<u8>> {
    thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = (&mut source).take(cap as u64 + 1).read_to_end(&mut buf);
        if buf.len() > cap {
            too_large.store(true, Ordering::Relaxed);
            buf.clear();
        }
        buf
    })
}
