//! The macOS spike wiring: the overlay window, the foreground and termination observers,
//! the idle sampler and the coalesced `spike-usage-changed` events. The overlay is a Tauri
//! window made into a non-activating panel, the approach ADR-004 decided.
//!
//! Threading: the observers and `setup` run on the main thread, and so do the synchronous
//! spike commands. All window and AppKit work goes through [`on_main`]
//! (`run_on_main_thread`), and the [`Spike`] state lock is never held across it.

use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant, SystemTime};

use orasenda_core::clock::epoch_ms;
use orasenda_core::{
    AppControl, AppRef, BlockAction, ForegroundSource, IdleSource, PlatformError, UsageSegment,
    UsageTracker,
};
use orasenda_platform_macos::{
    MacAppControl, MacForeground, MacIdle, configure_overlay, cover_main_screen, focus_overlay,
    phone_bundle_id,
};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_specta::Event;

use super::state::Step;
use super::{OverlayShow, Spike, SpikePlatform, SpikeUsageChanged};

/// The overlay window's label (granted by `capabilities/overlay.json`).
const OVERLAY: &str = "overlay";
/// Orasenda's main window label.
const MAIN: &str = "main";
/// How often the idle time is sampled.
const IDLE_SAMPLE_INTERVAL: Duration = Duration::from_secs(5);

/// Starts the spike on macOS: creates the hidden overlay window, installs
/// [`MacSpikePlatform`], subscribes to foreground changes and app terminations, and starts
/// the `spike-idle` and `spike-usage` threads. Runs on the main thread, from `setup()`.
pub(crate) fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle = app.handle().clone();

    WebviewWindowBuilder::new(app, OVERLAY, WebviewUrl::App("overlay.html".into()))
        .title("Orasenda")
        .visible(false)
        .focused(false)
        .decorations(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .build()?;
    on_main(&handle, configure_overlay_window)?;

    let phone = phone_bundle_id();
    let spike = app.state::<Spike>();
    spike
        .state()
        .set_extra_allow(phone.iter().cloned().collect());
    spike
        .install(Box::new(MacSpikePlatform {
            app: handle.clone(),
        }))
        .map_err(|error| format!("could not install the macOS spike platform: {error:?}"))?;

    let usage = spawn_usage_emitter(handle.clone())?;
    let foreground = MacForeground::new();
    foreground.subscribe(Box::new({
        let handle = handle.clone();
        let usage = usage.clone();
        move |front| on_foreground(&handle, &usage, front)
    }))?;
    foreground.subscribe_terminations(Box::new({
        let handle = handle.clone();
        move |pid| on_terminated(&handle, pid)
    }))?;
    spawn_idle_sampler(handle, usage)?;

    eprintln!("spike: setup done, extra allow {phone:?}");
    Ok(())
}

/// The spike's side effects on macOS. App listing, hiding and quitting are thread-safe;
/// everything that touches a window or `NSApplication` runs through [`on_main`].
pub(crate) struct MacSpikePlatform {
    app: AppHandle,
}

impl SpikePlatform for MacSpikePlatform {
    fn running_apps(&self) -> Vec<AppRef> {
        MacAppControl.running_apps()
    }

    fn hide_or_close(&self, pid: i32, action: BlockAction) -> Result<(), PlatformError> {
        match action {
            BlockAction::Hide => MacAppControl.hide(pid),
            BlockAction::Close => MacAppControl.terminate(pid),
        }
    }

    fn activate(&self, pid: i32) -> Result<(), PlatformError> {
        // On the main thread `activate` also yields our activation (cooperative, macOS 14+).
        on_main(&self.app, move |_| MacAppControl.activate(pid))
    }

    fn show_overlay(&self, show: OverlayShow) -> Result<(), PlatformError> {
        present_overlay(&self.app, show)
    }

    fn hide_overlay(&self) -> Result<(), PlatformError> {
        hide_overlay_window(&self.app)
    }

    fn show_main(&self) -> Result<(), PlatformError> {
        on_main(&self.app, |app| {
            let window = app
                .get_webview_window(MAIN)
                .ok_or(PlatformError::NotFound)?;
            window.show().map_err(tauri_error)?;
            window.set_focus().map_err(tauri_error)
        })
    }
}

/// A foreground change (main thread): the state decides under the lock
/// ([`SpikeState::on_foreground`](super::state::SpikeState::on_foreground)), then the
/// overlay is shown, re-targeted or closed without holding it.
fn on_foreground(app: &AppHandle, usage: &UsageNotifier, front: AppRef) {
    let arrived = Instant::now();
    let spike = app.state::<Spike>();
    let step =
        spike
            .state()
            .on_foreground(front, spike.own_bundle_id(), epoch_ms(SystemTime::now()));
    usage.changed();
    match step {
        Some(Step::Show(show)) => {
            let name = show.app_name.clone();
            match present_overlay(app, show) {
                Ok(()) => eprintln!("spike: overlay {} ms", arrived.elapsed().as_millis()),
                Err(error) => {
                    eprintln!("spike: could not show the overlay for {name}: {error}");
                    // Otherwise the gate keeps it open and ignores the target from now on;
                    // closing lets the next activation retry.
                    close_overlay(app, &spike);
                }
            }
        }
        Some(Step::Close) => close_overlay(app, &spike),
        None => {}
    }
}

/// An app quit (main thread): when it is the overlay's target, the overlay closes.
fn on_terminated(app: &AppHandle, pid: i32) {
    let spike = app.state::<Spike>();
    let is_target = spike
        .state()
        .target()
        .is_some_and(|target| target.pid == pid);
    if is_target {
        eprintln!("spike: the target quit, closing the overlay");
        close_overlay(app, &spike);
    }
}

/// Hides the overlay, then closes it in the state (gate re-enabled, nothing pending).
fn close_overlay(app: &AppHandle, spike: &Spike) {
    if let Err(error) = hide_overlay_window(app) {
        eprintln!("spike: could not hide the overlay: {error}");
    }
    spike.state().close_overlay();
}

/// Makes the new window the overlay: level and collection behavior, then the non-activating
/// panel (ADR-004).
fn configure_overlay_window(app: &AppHandle) -> Result<(), PlatformError> {
    let window = overlay_window(app)?;
    // SAFETY: ns_window() returns the live window's NSWindow; we are on the main thread via
    // run_on_main_thread and the pointer does not outlive this block.
    unsafe { configure_overlay(window.ns_window().map_err(tauri_error)?) }
}

/// Covers the main screen, emits `overlay-show`, shows and focuses the overlay. Until the
/// page is listening the event may be lost: the state keeps the show pending and
/// `spike_overlay_ready` re-emits it. A show while visible re-targets the overlay.
fn present_overlay(app: &AppHandle, show: OverlayShow) -> Result<(), PlatformError> {
    on_main(app, move |app| {
        let window = overlay_window(app)?;
        // SAFETY: ns_window() returns the live window's NSWindow; we are on the main thread via
        // run_on_main_thread and the pointer does not outlive this block.
        unsafe { cover_main_screen(window.ns_window().map_err(tauri_error)?) }?;
        show.emit_to(app, OVERLAY).map_err(tauri_error)?;
        window.show().map_err(tauri_error)?;
        // SAFETY: ns_window() returns the live window's NSWindow; we are on the main thread via
        // run_on_main_thread and the pointer does not outlive this block.
        unsafe { focus_overlay(window.ns_window().map_err(tauri_error)?) }
    })
}

/// Hides the overlay window.
fn hide_overlay_window(app: &AppHandle) -> Result<(), PlatformError> {
    on_main(app, |app| overlay_window(app)?.hide().map_err(tauri_error))
}

fn overlay_window(app: &AppHandle) -> Result<WebviewWindow, PlatformError> {
    app.get_webview_window(OVERLAY)
        .ok_or_else(|| PlatformError::Other("no overlay window".into()))
}

/// Runs `work` on the main thread with `run_on_main_thread` and returns its result. Called
/// on the main thread (setup, observers, synchronous commands), Tauri runs it inline;
/// elsewhere this waits for it. Never call it while holding the state lock.
fn on_main<T: Send + 'static>(
    app: &AppHandle,
    work: impl FnOnce(&AppHandle) -> Result<T, PlatformError> + Send + 'static,
) -> Result<T, PlatformError> {
    let (sender, receiver) = mpsc::sync_channel(1);
    let handle = app.clone();
    app.run_on_main_thread(move || {
        // The receiver only goes away if the caller already returned; nothing to report.
        let _ = sender.send(work(&handle));
    })
    .map_err(tauri_error)?;
    let result = if thread::current().name() == Some("main") {
        // Never block the main thread waiting on itself: Tauri ran the work inline.
        receiver
            .try_recv()
            .map_err(|_| PlatformError::Other("main-thread work was queued, not run".into()))
    } else {
        receiver
            .recv()
            .map_err(|_| PlatformError::Other("main-thread work was dropped".into()))
    };
    result?
}

fn tauri_error(error: tauri::Error) -> PlatformError {
    PlatformError::Other(error.to_string())
}

/// Tells the `spike-usage` thread that usage changed.
#[derive(Clone)]
struct UsageNotifier(mpsc::Sender<()>);

impl UsageNotifier {
    fn changed(&self) {
        // The thread only stops when the app exits.
        let _ = self.0.send(());
    }
}

/// Starts thread `spike-usage`, which emits `spike-usage-changed` to `main` at most once per
/// second however often usage changes.
fn spawn_usage_emitter(app: AppHandle) -> std::io::Result<UsageNotifier> {
    let (sender, receiver) = mpsc::channel::<()>();
    thread::Builder::new()
        .name("spike-usage".into())
        .spawn(move || {
            let mut coalescer = UsageCoalescer::default();
            while receiver.recv().is_ok() {
                let Some(at) = coalescer.on_change(Instant::now()) else {
                    continue;
                };
                thread::sleep(at.saturating_duration_since(Instant::now()));
                // Changes that arrived while waiting fold into this emit.
                while receiver.try_recv().is_ok() {
                    coalescer.on_change(Instant::now());
                }
                if let Err(error) = SpikeUsageChanged.emit_to(&app, MAIN) {
                    eprintln!("spike: could not emit spike-usage-changed: {error}");
                }
                coalescer.emitted(Instant::now());
            }
        })?;
    Ok(UsageNotifier(sender))
}

/// Starts thread `spike-idle`: every 5 s, the idle time goes to the usage tracker.
fn spawn_idle_sampler(app: AppHandle, usage: UsageNotifier) -> std::io::Result<()> {
    thread::Builder::new()
        .name("spike-idle".into())
        .spawn(move || {
            loop {
                thread::sleep(IDLE_SAMPLE_INTERVAL);
                let idle_ms = match MacIdle.idle_ms() {
                    Ok(idle_ms) => idle_ms,
                    Err(error) => {
                        eprintln!("spike: could not read the idle time: {error}");
                        continue;
                    }
                };
                let spike = app.state::<Spike>();
                let changed = {
                    let mut state = spike.state();
                    let before = last_segment(&state.tracker);
                    state
                        .tracker
                        .on_idle_sample(idle_ms, epoch_ms(SystemTime::now()));
                    before != last_segment(&state.tracker)
                };
                if changed {
                    usage.changed();
                }
            }
        })?;
    Ok(())
}

/// What an idle sample can change: the segment count and the newest segment.
fn last_segment(tracker: &UsageTracker) -> (usize, Option<UsageSegment>) {
    let segments = tracker.segments();
    (segments.len(), segments.last().cloned())
}

/// The shortest gap between two `spike-usage-changed` events.
const USAGE_CHANGED_INTERVAL: Duration = Duration::from_secs(1);

/// Coalesces usage changes into at most one `spike-usage-changed` per second.
#[derive(Debug, Default)]
struct UsageCoalescer {
    last_emit: Option<Instant>,
    scheduled: Option<Instant>,
}

impl UsageCoalescer {
    /// A usage change at `now`. Returns when to emit, or `None` when an emit is already
    /// scheduled and the change folds into it.
    fn on_change(&mut self, now: Instant) -> Option<Instant> {
        if self.scheduled.is_some() {
            return None;
        }
        let at = match self.last_emit {
            Some(last) => now.max(last + USAGE_CHANGED_INTERVAL),
            None => now,
        };
        self.scheduled = Some(at);
        Some(at)
    }

    /// The scheduled emit happened at `now`.
    fn emitted(&mut self, now: Instant) {
        self.last_emit = Some(now);
        self.scheduled = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usage_changed_is_coalesced_to_one_per_second() {
        let t0 = Instant::now();
        let ms = Duration::from_millis;
        let mut coalescer = UsageCoalescer::default();

        // The first change emits at once.
        assert_eq!(coalescer.on_change(t0), Some(t0));
        coalescer.emitted(t0);

        // Changes within the next second wait for it, and fold into one emit.
        assert_eq!(coalescer.on_change(t0 + ms(100)), Some(t0 + ms(1000)));
        assert_eq!(coalescer.on_change(t0 + ms(200)), None);
        assert_eq!(coalescer.on_change(t0 + ms(900)), None);
        coalescer.emitted(t0 + ms(1000));

        // A change long after the last emit goes out at once again.
        assert_eq!(coalescer.on_change(t0 + ms(2500)), Some(t0 + ms(2500)));
        coalescer.emitted(t0 + ms(2500));
        assert_eq!(coalescer.on_change(t0 + ms(3499)), Some(t0 + ms(3500)));
    }
}
