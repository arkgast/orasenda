//! The macOS spike wiring: the overlay window, the foreground and termination observers,
//! the idle sampler and the coalesced `spike-usage-changed` events.
//!
//! Threading: the observers and `setup` run on the main thread, and so do the synchronous
//! spike commands. All window and AppKit work goes through [`on_main`]
//! (`run_on_main_thread`), and the [`Spike`] state lock is never held across it.

use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant, SystemTime};

use orasenda_core::clock::epoch_ms;
use orasenda_core::{
    AppControl, AppRef, BlockAction, Decision, ForegroundSource, GateAction, IdleSource,
    PlatformError, SAFETY_ALLOWLIST, UsageSegment, UsageTracker, decide,
};
use orasenda_platform_macos::{
    MacAppControl, MacForeground, MacIdle, OverlayStrategy, configure_overlay, cover_main_screen,
    focus_overlay, phone_bundle_id, restore_activation_policy,
};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_specta::Event;

use super::overlay::OVERLAY_STRATEGY;
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
    spike.state().extra_allow = phone.iter().cloned().collect();
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

    eprintln!("spike: setup done, overlay strategy {OVERLAY_STRATEGY:?}, extra allow {phone:?}");
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

/// What the foreground sink does once the state lock is released.
enum Step {
    Show(OverlayShow),
    Close,
}

/// A foreground change (main thread): track it, update `previous`, ask the gate, then show,
/// re-target or close the overlay without holding the lock.
fn on_foreground(app: &AppHandle, usage: &UsageNotifier, front: AppRef) {
    let arrived = Instant::now();
    let spike = app.state::<Spike>();
    let step = {
        let mut state = spike.state();
        state
            .tracker
            .on_foreground(&front, epoch_ms(SystemTime::now()));
        let own = spike.own_bundle_id();
        let decision = decide(&front, &state.rule, own, &state.extra_allow);
        let previous = state.previous.take();
        state.previous = next_previous(previous, &front, decision, own);
        match state.gate_on_foreground(&front, decision) {
            GateAction::Show => state.open_overlay(front).map(Step::Show),
            GateAction::CloseOverlay => Some(Step::Close),
            GateAction::Ignore => None,
        }
    };
    usage.changed();
    match step {
        Some(Step::Show(show)) => {
            let name = show.app_name.clone();
            match present_overlay(app, show) {
                Ok(()) => eprintln!("spike: overlay {} ms", arrived.elapsed().as_millis()),
                Err(error) => eprintln!("spike: could not show the overlay for {name}: {error}"),
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

/// Applies the overlay strategy to the new window. `LevelAndCollection` always applies;
/// `NonActivatingPanel` is layered on it here, `AccessoryPolicy` while the overlay shows.
fn configure_overlay_window(app: &AppHandle) -> Result<(), PlatformError> {
    let window = overlay_window(app)?;
    // SAFETY: ns_window() returns the live window's NSWindow; we are on the main thread via
    // run_on_main_thread and the pointer does not outlive this block.
    unsafe {
        configure_overlay(
            window.ns_window().map_err(tauri_error)?,
            OverlayStrategy::LevelAndCollection,
        )
    }?;
    if OVERLAY_STRATEGY == OverlayStrategy::NonActivatingPanel {
        // SAFETY: ns_window() returns the live window's NSWindow; we are on the main thread
        // via run_on_main_thread and the pointer does not outlive this block.
        unsafe { configure_overlay(window.ns_window().map_err(tauri_error)?, OVERLAY_STRATEGY) }?;
    }
    Ok(())
}

/// Covers the main screen, emits `overlay-show`, shows and focuses the overlay. Until the
/// page is listening the event may be lost: the state keeps the show pending and
/// `spike_overlay_ready` re-emits it. A show while visible re-targets the overlay.
fn present_overlay(app: &AppHandle, show: OverlayShow) -> Result<(), PlatformError> {
    on_main(app, move |app| {
        let window = overlay_window(app)?;
        if OVERLAY_STRATEGY == OverlayStrategy::AccessoryPolicy {
            // SAFETY: ns_window() returns the live window's NSWindow; we are on the main
            // thread via run_on_main_thread and the pointer does not outlive this block.
            unsafe {
                configure_overlay(window.ns_window().map_err(tauri_error)?, OVERLAY_STRATEGY)
            }?;
        }
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

/// Hides the overlay (and gives Orasenda its Dock icon back under `AccessoryPolicy`).
fn hide_overlay_window(app: &AppHandle) -> Result<(), PlatformError> {
    on_main(app, |app| {
        overlay_window(app)?.hide().map_err(tauri_error)?;
        if OVERLAY_STRATEGY == OverlayStrategy::AccessoryPolicy {
            restore_activation_policy()?;
        }
        Ok(())
    })
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

/// The `previous` app after `app` came to the front with `decision`: `app` itself when it is
/// countable and was not intercepted; otherwise `previous` is kept.
///
/// Countable is the gate's notion (`Gate::countable` in core, which is private): a bundle
/// ID that is neither Orasenda's nor on the safety allowlist. `extra_allow` apps (Phone)
/// are countable; `decide` already lets them through.
fn next_previous(
    previous: Option<AppRef>,
    app: &AppRef,
    decision: Decision,
    own_bundle_id: &str,
) -> Option<AppRef> {
    let countable = app
        .bundle_id
        .as_deref()
        .is_some_and(|id| id != own_bundle_id && !SAFETY_ALLOWLIST.contains(&id));
    if countable && decision == Decision::Allow {
        Some(app.clone())
    } else {
        previous
    }
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

    const OWN: &str = "com.veloud.orasenda";

    fn app(id: Option<&str>, name: &str, pid: i32) -> AppRef {
        AppRef {
            bundle_id: id.map(str::to_owned),
            name: name.to_owned(),
            pid,
        }
    }

    #[test]
    fn previous_skips_self_allowlisted_unbundled_and_targets() {
        let editor = app(Some("com.x.editor"), "Editor", 1);
        let start = Some(editor.clone());
        let skipped = [
            (app(Some(OWN), "Orasenda", 2), Decision::Allow),
            (
                app(Some(SAFETY_ALLOWLIST[0]), "Allowlisted", 3),
                Decision::Allow,
            ),
            (app(None, "tool", 5), Decision::Allow),
            (app(Some("com.x.game"), "Game", 6), Decision::Intercept),
        ];
        for (skip, decision) in skipped {
            assert_eq!(
                next_previous(start.clone(), &skip, decision, OWN),
                start,
                "{skip:?}"
            );
        }
        // An `extra_allow` app (Phone) is countable, like for the gate: it can be previous.
        let phone = app(Some("com.apple.mobilephone"), "Phone", 4);
        assert_eq!(
            next_previous(start.clone(), &phone, Decision::Allow, OWN),
            Some(phone)
        );
        let browser = app(Some("com.x.browser"), "Browser", 7);
        assert_eq!(
            next_previous(start, &browser, Decision::Allow, OWN),
            Some(browser.clone())
        );
        assert_eq!(
            next_previous(None, &browser, Decision::Allow, OWN),
            Some(browser)
        );
    }

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
