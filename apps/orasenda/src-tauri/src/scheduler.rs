//! The `session-scheduler` thread and every publish step (spec: Scheduler).
//!
//! Once a second it advances the session under the lock, then, with the lock released, emits
//! `clock-tick` and publishes the session's [`Effects`]. Nothing here holds the service or
//! [`Surfaces`] lock while it emits, renders a surface or calls the [`Notifier`].

use std::io;
use std::panic::{self, AssertUnwindSafe};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;
use std::time::SystemTime;

use orasenda_core::clock::delay_to_next_second;
use orasenda_core::{EndReason, EngineState, NotificationStatus, Notifier};
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use crate::ClockTick;
use crate::ipc::{MilestoneEvent, Settings, SettingsChanged, Theme, TimerView};
use crate::session::{Effects, SessionService, Surfaces, ViewGate, lock};

/// Where the publish steps send their output: the running app, or a recording fake in tests.
pub trait Host: Clone + Send + Sync + 'static {
    /// The service, or `None` before `session::setup` has managed it.
    fn service(&self) -> Option<&Mutex<SessionService>>;
    fn surfaces(&self) -> Option<&Surfaces>;
    /// The publish-order gate, or `None` before `session::setup` has managed it.
    fn view_gate(&self) -> Option<&ViewGate>;
    fn notifier(&self) -> Arc<dyn Notifier>;
    fn now_ms(&self) -> u64;
    /// Emits `timer-tick`. An emit error is logged, never fatal.
    fn emit_timer_tick(&self, view: &TimerView);
    /// Emits `timer-milestone`. An emit error is logged, never fatal.
    fn emit_milestone(&self, event: &MilestoneEvent);
    /// Emits `clock-tick`. An emit error is logged, never fatal.
    fn emit_clock_tick(&self, tick: &ClockTick);
    /// Emits `settings-changed`. An emit error is logged, never fatal.
    fn emit_settings_changed(&self, settings: &Settings);
    /// Applies the app-wide theme (`System` clears the override). Never called under the
    /// service lock.
    fn apply_theme(&self, theme: Theme);
}

/// The Tauri theme for a saved one: `System` clears the override.
pub(crate) fn tauri_theme(theme: Theme) -> Option<tauri::Theme> {
    match theme {
        Theme::System => None,
        Theme::Light => Some(tauri::Theme::Light),
        Theme::Dark => Some(tauri::Theme::Dark),
    }
}

impl Host for AppHandle {
    fn service(&self) -> Option<&Mutex<SessionService>> {
        self.try_state::<Mutex<SessionService>>()
            .map(|state| state.inner())
    }

    fn surfaces(&self) -> Option<&Surfaces> {
        self.try_state::<Surfaces>().map(|state| state.inner())
    }

    fn view_gate(&self) -> Option<&ViewGate> {
        self.try_state::<ViewGate>().map(|state| state.inner())
    }

    fn notifier(&self) -> Arc<dyn Notifier> {
        match self.try_state::<Arc<dyn Notifier>>() {
            Some(notifier) => Arc::clone(notifier.inner()),
            None => Arc::new(orasenda_core::NoopNotifier),
        }
    }

    fn now_ms(&self) -> u64 {
        crate::session::now_ms()
    }

    fn emit_timer_tick(&self, view: &TimerView) {
        if let Err(error) = view.emit(self) {
            eprintln!("session-scheduler: could not emit timer-tick: {error}");
        }
    }

    fn emit_milestone(&self, event: &MilestoneEvent) {
        if let Err(error) = event.emit(self) {
            eprintln!("session-scheduler: could not emit timer-milestone: {error}");
        }
    }

    fn emit_clock_tick(&self, tick: &ClockTick) {
        if let Err(error) = tick.emit(self) {
            eprintln!("session-scheduler: could not emit clock-tick: {error}");
        }
    }

    fn emit_settings_changed(&self, settings: &Settings) {
        if let Err(error) = SettingsChanged(settings.clone()).emit(self) {
            eprintln!("session-scheduler: could not emit settings-changed: {error}");
        }
    }

    fn apply_theme(&self, theme: Theme) {
        self.set_theme(tauri_theme(theme));
    }
}

/// The end notification (spec: Notification).
const END_TITLE: &str = "Focus session complete.";
const END_BODY: &str = "Time for a break.";

/// Starts the `session-scheduler` thread. It re-reads the wall clock on every iteration, so
/// sleep, clock jumps and NTP corrections realign on the next tick. Fails only when the OS
/// cannot start the thread.
pub fn spawn<H: Host>(host: H) -> io::Result<()> {
    thread::Builder::new()
        .name("session-scheduler".into())
        .spawn(move || {
            loop {
                thread::sleep(delay_to_next_second(SystemTime::now()));
                iterate(&host);
            }
        })?;
    Ok(())
}

/// One scheduler iteration, inside `catch_unwind`: a panic is logged and the loop goes on.
/// A panic under the service lock poisons it; [`lock`] recovers it.
pub(crate) fn iterate<H: Host>(host: &H) {
    let step = panic::catch_unwind(AssertUnwindSafe(|| tick_once(host)));
    if step.is_err() {
        eprintln!("session-scheduler: an iteration panicked; continuing");
    }
}

/// Advance and take the clock under the lock; emit and publish after it.
fn tick_once<H: Host>(host: &H) {
    let Some(service) = host.service() else {
        return;
    };
    let now_ms = host.now_ms();
    let (effects, clock) = {
        let mut service = lock(service);
        let effects = service.tick(now_ms);
        (effects, service.clock_tick(now_ms))
    };
    host.emit_clock_tick(&clock);
    publish(host, effects);
}

/// Emits one `clock-tick` now.
pub fn publish_clock<H: Host>(host: &H) {
    let Some(service) = host.service() else {
        return;
    };
    let clock = lock(service).clock_tick(host.now_ms());
    host.emit_clock_tick(&clock);
}

/// On `Focused(true)`: one `clock-tick`, plus one `timer-tick` and a surface render while a
/// session is running or paused.
pub fn publish_focus<H: Host>(host: &H) {
    publish_clock(host);
    let Some(service) = host.service() else {
        return;
    };
    let (seq, view) = lock(service).snapshot(host.now_ms());
    if view.state != EngineState::Idle {
        publish_view(host, seq, &view);
    }
}

/// Carries out `effects` after the service lock is released, in this order: the view and
/// the surfaces, the theme (when a recovered read changed it), `settings-changed` (when owed), the end notification, the guard drop, the
/// milestones.
pub fn publish<H: Host>(host: &H, effects: Effects) {
    let Effects {
        view,
        was_idle,
        store_changed,
        milestones,
        ended,
        notify_session_end,
        drop_after_unlock,
        settings_changed,
        apply_theme,
        seq,
        ..
    } = effects;
    if !was_idle || view.state != EngineState::Idle || store_changed {
        publish_view(host, seq, &view);
    }
    if let Some(theme) = apply_theme {
        host.apply_theme(theme);
    }
    if let Some(settings) = &settings_changed {
        host.emit_settings_changed(settings);
    }
    let completed = ended.is_some_and(|record| record.end_reason == EndReason::Completed);
    if completed && notify_session_end {
        notify_end(host);
    }
    drop(drop_after_unlock);
    for milestone in &milestones {
        host.emit_milestone(milestone);
    }
}

/// [`publish`] for a command, whose action is already committed: a panic while publishing
/// (a surface, an emit) is logged instead of turning that result into a failure.
pub(crate) fn publish_caught<H: Host>(host: &H, effects: Effects) {
    let published = panic::catch_unwind(AssertUnwindSafe(|| publish(host, effects)));
    if published.is_err() {
        eprintln!("session: publishing a command's effects panicked; its result stands");
    }
}

/// Re-reads the status off-lock (a permission granted later in System Settings counts),
/// publishes a change, then posts when granted.
fn notify_end<H: Host>(host: &H) {
    let notifier = host.notifier();
    let status = notifier.status();
    store_status(host, status);
    if status == NotificationStatus::Granted
        && let Err(error) = notifier.post(END_TITLE, END_BODY)
    {
        eprintln!("notifier: could not post the end notification: {error}");
    }
}

/// Stores a status read or answer; emits one `timer-tick` when the shown status changed,
/// in every state (plan amendment 4).
///
/// Then runs the pending notify review, which this status may complete (the launch read,
/// the focus re-read, a request's answer, the re-read before posting). After unlock, one
/// `settings-changed` goes out when the review wrote.
pub(crate) fn store_status<H: Host>(host: &H, status: NotificationStatus) {
    let Some(service) = host.service() else {
        return;
    };
    let (view, reviewed) = {
        let mut service = lock(service);
        let now_ms = host.now_ms();
        let view = apply_status(&mut service, status, now_ms);
        let reviewed = service
            .run_notify_review(now_ms)
            .then(|| service.settings());
        (view, reviewed)
    };
    if let Some((seq, view)) = view {
        publish_view(host, seq, &view);
    }
    if let Some(settings) = reviewed {
        host.emit_settings_changed(&settings);
    }
}

/// Stores `status` in the locked service; the numbered view to publish when it changed.
fn apply_status(
    service: &mut crate::session::SessionService,
    status: NotificationStatus,
    now_ms: u64,
) -> Option<(u64, TimerView)> {
    service
        .set_notifications(status)
        .then(|| service.snapshot(now_ms))
}

/// Emits `timer-tick` and renders the surfaces for `view`, unless a newer view (by `seq`)
/// was already published. The gate is held across the emit and the renders so a stale view
/// can't slip in between a newer one's check and its render. That is safe because neither
/// waits on the main thread: an emit posts to the webview and `Tray::render` only records
/// the view and posts its draw. The notifier, the guard drop and the milestones stay
/// outside the gate.
pub(crate) fn publish_view<H: Host>(host: &H, seq: u64, view: &TimerView) {
    let Some(gate) = host.view_gate() else {
        // Only before `session::setup`, when nothing else publishes either.
        host.emit_timer_tick(view);
        render_surfaces(host, view);
        return;
    };
    let mut last = gate.0.lock().unwrap_or_else(PoisonError::into_inner);
    if seq <= *last {
        return;
    }
    *last = seq;
    host.emit_timer_tick(view);
    render_surfaces(host, view);
}

/// Clones the surface list under its lock and renders after releasing it.
fn render_surfaces<H: Host>(host: &H, view: &TimerView) {
    let Some(surfaces) = host.surfaces() else {
        return;
    };
    let list = surfaces
        .0
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .clone();
    for surface in list {
        surface.render(view);
    }
}

/// The launch read of the notification status, on its own thread.
pub(crate) fn read_launch_status<H: Host>(host: &H) {
    let status = host.notifier().status();
    store_status(host, status);
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::mpsc::channel;
    use std::thread;
    use std::time::Duration;

    use orasenda_core::{EndReason, EngineState, NotificationStatus, Preset};

    use super::*;
    use crate::ipc::{MilestoneKind, StoreStatus};
    use crate::session::test_support::Event;
    use crate::session::test_support::*;
    use crate::session::{Action, NativeSurface, lock, run_action_on};

    const WAIT: Duration = Duration::from_secs(10);

    fn ticks(events: &[Event]) -> Vec<TimerView> {
        events
            .iter()
            .filter_map(|e| match e {
                Event::Tick(view) => Some(view.clone()),
                _ => None,
            })
            .collect()
    }

    fn launched(status: NotificationStatus) -> TestHost {
        let host = TestHost::new(status);
        read_launch_status(&host);
        host.log().take();
        host
    }

    /// A surface that records renders into the host's log.
    struct Recorder(Log);

    impl NativeSurface for Recorder {
        fn render(&self, view: &TimerView) {
            self.0.push(Event::Render(view.clone()));
        }
    }

    fn with_recorder(host: &TestHost) {
        host.0
            .surfaces
            .0
            .lock()
            .expect("surfaces")
            .push(Arc::new(Recorder(host.log().clone())));
    }

    #[test]
    fn ending_tick_publishes_idle_view_once_and_lists_ended_effects() {
        let host = launched(NotificationStatus::Granted);
        with_recorder(&host);
        run_action_on(&host, start(Preset::Classic)).expect("starts");
        host.log().take();
        host.set_now(T0 + 1_000);
        iterate(&host);
        let running = host.log().take();
        assert!(matches!(running[0], Event::Clock(_)), "{running:?}");
        assert_eq!(ticks(&running).len(), 1);
        assert_eq!(ticks(&running)[0].state, EngineState::Running);

        host.set_now(T0 + CLASSIC_MS);
        iterate(&host);
        let events = host.log().take();
        let idle = ticks(&events);
        assert_eq!(idle.len(), 1, "{events:?}");
        assert_eq!(idle[0].state, EngineState::Idle);
        let kinds: Vec<&str> = events
            .iter()
            .map(|e| match e {
                Event::Clock(_) => "clock",
                Event::Tick(_) => "tick",
                Event::Render(_) => "render",
                Event::StatusRead => "status",
                Event::Posted(..) => "post",
                Event::Released => "released",
                Event::Milestone(_) => "milestone",
                Event::Requested => "requested",
                Event::Begun => "begun",
                Event::SettingsChanged(_) => "settings",
                Event::ApplyTheme(_) => "theme",
                Event::OpenedSettings => "opened",
            })
            .collect();
        assert_eq!(
            kinds,
            [
                "clock",
                "tick",
                "render",
                "status",
                "post",
                "released",
                "milestone"
            ]
        );
        assert!(events.contains(&Event::Render(idle[0].clone())));
        assert!(events.contains(&Event::Milestone(MilestoneEvent {
            kind: MilestoneKind::Ended,
            end_reason: Some(EndReason::Completed),
            session_id: idle_session_id(&running),
        })));

        host.set_now(T0 + CLASSIC_MS + 1_000);
        iterate(&host);
        let quiet = host.log().take();
        assert_eq!(quiet.len(), 1, "idle costs one clock-tick: {quiet:?}");
        assert!(matches!(quiet[0], Event::Clock(_)));
    }

    fn idle_session_id(running: &[Event]) -> Option<orasenda_core::SessionId> {
        ticks(running)[0].session_id.clone()
    }

    #[test]
    fn store_status_runs_the_pending_review_once() {
        let store = memory_store();
        store.put_meta_for_tests("notify_review", "pending");
        store
            .write(0, |txn| {
                orasenda_store::settings::set(txn, "notify.session_end", &true)
            })
            .expect("seeds");
        let f = fakes(NotificationStatus::Unavailable, false);
        let s = SessionService::new(Ok(store), f.platform, T0);
        let host = TestHost::with(s, f.log, f.notifier);
        host.log().take();
        let changes = |h: &TestHost| {
            crate::session::test_support::db(&lock(&h.0.service))
                .change_log_ids()
                .iter()
                .filter(|id| *id == "notify.session_end")
                .count()
        };
        let before = changes(&host);
        read_launch_status(&host);
        assert_eq!(changes(&host), before, "unknown status leaves it pending");
        store_status(&host, NotificationStatus::Granted);
        store_status(&host, NotificationStatus::Denied);
        assert_eq!(changes(&host), before + 1);
        let events = host.log().take();
        let n = events
            .iter()
            .filter(|e| matches!(e, Event::SettingsChanged(_)))
            .count();
        assert_eq!(n, 1, "{events:?}");
        assert_eq!(
            host.0.under_lock.load(std::sync::atomic::Ordering::SeqCst),
            0
        );
    }

    #[test]
    fn start_never_requests_notification_permission() {
        for status in [
            NotificationStatus::NotDetermined,
            NotificationStatus::Granted,
            NotificationStatus::Denied,
            NotificationStatus::Unavailable,
        ] {
            let host = launched(status);
            run_action_on(&host, start(Preset::Classic)).expect("starts");
            assert_eq!(
                host.log().count(|e| *e == Event::Requested),
                0,
                "{status:?}"
            );
        }
        let unread = TestHost::new(NotificationStatus::NotDetermined);
        run_action_on(&unread, start(Preset::Classic)).expect("starts");
        assert_eq!(unread.log().count(|e| *e == Event::Requested), 0, "unread");
    }

    #[test]
    fn launch_status_read_publishes_one_tick_when_changed_and_none_when_not() {
        let host = TestHost::new(NotificationStatus::NotDetermined);
        read_launch_status(&host);
        let first = ticks(&host.log().take());
        assert_eq!(first.len(), 1);
        assert_eq!(first[0].notifications, NotificationStatus::NotDetermined);
        assert_eq!(first[0].state, EngineState::Idle);
        read_launch_status(&host);
        assert!(ticks(&host.log().take()).is_empty());

        let unavailable = TestHost::new(NotificationStatus::Unavailable);
        read_launch_status(&unavailable);
        assert!(ticks(&unavailable.log().take()).is_empty());
    }

    #[test]
    fn notification_posted_only_for_completed_when_granted_and_enabled() {
        let expected = Event::Posted("Focus session complete.".into(), "Time for a break.".into());
        let completed = launched(NotificationStatus::Granted);
        run_action_on(&completed, start(Preset::Classic)).expect("starts");
        completed.set_now(T0 + CLASSIC_MS);
        iterate(&completed);
        assert_eq!(completed.log().count(|e| *e == expected), 1);

        let stopped = launched(NotificationStatus::Granted);
        run_action_on(&stopped, start(Preset::Classic)).expect("starts");
        run_action_on(&stopped, Action::Stop).expect("stops");
        assert_eq!(stopped.log().count(|e| matches!(e, Event::Posted(..))), 0);

        let denied = launched(NotificationStatus::Denied);
        run_action_on(&denied, start(Preset::Classic)).expect("starts");
        denied.set_now(T0 + CLASSIC_MS);
        iterate(&denied);
        assert_eq!(denied.log().count(|e| matches!(e, Event::Posted(..))), 0);
        assert_eq!(denied.log().count(|e| *e == Event::Requested), 0);

        let disabled = launched(NotificationStatus::Granted);
        lock(&disabled.0.service)
            .set_settings(
                crate::ipc::Settings {
                    notify_session_end: false,
                    ..crate::ipc::Settings::default()
                },
                T0,
            )
            .expect("saves");
        run_action_on(&disabled, start(Preset::Classic)).expect("starts");
        disabled.set_now(T0 + CLASSIC_MS);
        iterate(&disabled);
        assert_eq!(disabled.log().count(|e| matches!(e, Event::Posted(..))), 0);
        assert_eq!(disabled.log().count(|e| *e == Event::StatusRead), 0);
    }

    #[test]
    fn end_rereads_status_before_posting_and_publishes_the_change() {
        let host = launched(NotificationStatus::NotDetermined);
        run_action_on(&host, start(Preset::Classic)).expect("starts");
        // Granted later in System Settings; the request is never answered.
        host.0.notifier.set_status(NotificationStatus::Granted);
        host.log().take();
        host.set_now(T0 + CLASSIC_MS);
        iterate(&host);
        let events = host.log().take();
        let all = ticks(&events);
        assert_eq!(all.len(), 2, "{events:?}");
        assert_eq!(all[0].notifications, NotificationStatus::NotDetermined);
        assert_eq!(all[1].notifications, NotificationStatus::Granted);
        assert_eq!(all[1].state, EngineState::Idle);
        let second_tick = events
            .iter()
            .rposition(|e| matches!(e, Event::Tick(_)))
            .expect("tick");
        let posted = events
            .iter()
            .position(|e| matches!(e, Event::Posted(..)))
            .expect("posted");
        assert!(second_tick < posted, "{events:?}");

        // An unchanged re-read emits no extra tick.
        run_action_on(&host, start(Preset::Classic)).expect("starts");
        host.set_now(T0 + 2 * CLASSIC_MS);
        host.log().take();
        iterate(&host);
        assert_eq!(ticks(&host.log().take()).len(), 1);
    }

    /// While idle, the tick whose flush brings the store back to `ok` publishes exactly one
    /// `timer-tick` with `store: ok`, so the "can't save" line goes; the next unchanged
    /// tick publishes none (#104).
    #[test]
    fn idle_flush_back_to_ok_publishes_one_timer_tick() {
        let host = launched(NotificationStatus::Denied);
        run_action_on(&host, start(Preset::Classic)).expect("starts");
        db(&lock(&host.0.service)).fail_writes(true);
        run_action_on(&host, Action::Stop).expect("stops");
        host.log().take();
        iterate(&host);
        assert_eq!(ticks(&host.log().take()), [], "still failing");
        db(&lock(&host.0.service)).fail_writes(false);
        iterate(&host);
        let back = ticks(&host.log().take());
        assert_eq!(back.len(), 1, "{back:?}");
        assert_eq!(back[0].state, EngineState::Idle);
        assert_eq!(back[0].store, StoreStatus::Ok);
        iterate(&host);
        assert_eq!(ticks(&host.log().take()), []);
    }

    #[test]
    fn focused_republishes_timer_tick_only_while_non_idle() {
        let host = launched(NotificationStatus::Denied);
        with_recorder(&host);
        publish_focus(&host);
        let idle = host.log().take();
        assert_eq!(idle.len(), 1, "{idle:?}");
        assert!(matches!(idle[0], Event::Clock(_)));

        run_action_on(&host, start(Preset::Classic)).expect("starts");
        host.log().take();
        publish_focus(&host);
        let running = host.log().take();
        assert_eq!(running.len(), 3, "{running:?}");
        assert!(matches!(running[0], Event::Clock(_)));
        assert!(matches!(&running[1], Event::Tick(view) if view.state == EngineState::Running));
        assert!(matches!(&running[2], Event::Render(view) if view.state == EngineState::Running));

        run_action_on(&host, Action::Pause).expect("pauses");
        host.log().take();
        publish_focus(&host);
        assert_eq!(ticks(&host.log().take()).len(), 1);
    }

    /// Locks both `Surfaces` and the service inside `render`: it deadlocks if `publish` held
    /// either while rendering.
    struct Relocker {
        host: TestHost,
        rendered: std::sync::mpsc::Sender<()>,
    }

    impl NativeSurface for Relocker {
        fn render(&self, _view: &TimerView) {
            let surfaces = self.host.0.surfaces.0.lock().expect("surfaces");
            drop(surfaces);
            let service = self.host.0.service.try_lock();
            assert!(service.is_ok(), "the service lock is held while rendering");
            drop(service);
            let _ = self.rendered.send(());
        }
    }

    #[test]
    fn surfaces_are_rendered_after_the_lock_is_released() {
        let host = launched(NotificationStatus::Denied);
        let (rendered, renders) = channel();
        host.0
            .surfaces
            .0
            .lock()
            .expect("surfaces")
            .push(Arc::new(Relocker {
                host: host.clone(),
                rendered,
            }));
        let worker = {
            let host = host.clone();
            thread::spawn(move || {
                run_action_on(&host, start(Preset::Classic)).expect("starts");
                publish_focus(&host);
                host.set_now(T0 + CLASSIC_MS);
                iterate(&host);
            })
        };
        for _ in 0..3 {
            renders
                .recv_timeout(WAIT)
                .expect("rendered without deadlock");
        }
        worker.join().expect("no panic while rendering");
        // Break the host → surface → host cycle.
        host.0.surfaces.0.lock().expect("surfaces").clear();
    }

    /// Panics on its first render only.
    struct PanicOnce(AtomicBool);

    impl NativeSurface for PanicOnce {
        fn render(&self, _view: &TimerView) {
            if !self.0.swap(true, Ordering::SeqCst) {
                panic!("a surface failed");
            }
        }
    }

    #[test]
    fn a_panicking_iteration_is_logged_and_the_next_one_runs() {
        let host = launched(NotificationStatus::Denied);
        run_action_on(&host, start(Preset::Classic)).expect("starts");
        host.0
            .surfaces
            .0
            .lock()
            .expect("surfaces")
            .push(Arc::new(PanicOnce(AtomicBool::new(false))));
        host.log().take();
        host.set_now(T0 + 1_000);
        iterate(&host);
        host.set_now(T0 + 2_000);
        iterate(&host);
        let events = host.log().take();
        assert_eq!(
            events
                .iter()
                .filter(|e| matches!(e, Event::Clock(_)))
                .count(),
            2
        );
        assert_eq!(ticks(&events).len(), 2);
        // The service lock is usable after the panic.
        assert_eq!(
            lock(&host.0.service).view(T0 + 3_000).state,
            EngineState::Running
        );
    }

    #[test]
    fn publish_clock_emits_the_service_clock() {
        let host = launched(NotificationStatus::Denied);
        publish_clock(&host);
        let events = host.log().take();
        let expected = lock(&host.0.service).clock_tick(T0);
        assert_eq!(events, [Event::Clock(expected)]);
    }

    fn renders(events: &[Event]) -> Vec<TimerView> {
        events
            .iter()
            .filter_map(|e| match e {
                Event::Render(view) => Some(view.clone()),
                _ => None,
            })
            .collect()
    }

    /// The scheduler takes a running view, then a menu *End session* publishes the idle
    /// view before the scheduler publishes: the stale running view is dropped.
    #[test]
    fn stale_tick_view_is_not_published_after_a_newer_command() {
        let host = launched(NotificationStatus::Denied);
        with_recorder(&host);
        run_action_on(&host, start(Preset::Classic)).expect("starts");
        host.set_now(T0 + 1_000);
        host.log().take();

        let (ticked, has_ticked) = channel();
        let (go, may_publish) = channel::<()>();
        let scheduler = {
            let host = host.clone();
            thread::spawn(move || {
                let effects = lock(&host.0.service).tick(host.now_ms());
                assert_eq!(effects.view.state, EngineState::Running);
                ticked.send(()).unwrap();
                may_publish.recv_timeout(WAIT).expect("released");
                publish(&host, effects);
            })
        };
        has_ticked.recv_timeout(WAIT).expect("the scheduler ticked");
        let menu = {
            let host = host.clone();
            thread::spawn(move || run_action_on(&host, Action::Stop))
        };
        menu.join().unwrap().expect("stops");
        go.send(()).unwrap();
        scheduler.join().expect("no panic while publishing");

        let events = host.log().take();
        let ticks = ticks(&events);
        let renders = renders(&events);
        assert_eq!(ticks.len(), 1, "{events:?}");
        assert_eq!(renders.len(), 1, "{events:?}");
        assert_eq!(ticks[0].state, EngineState::Idle);
        assert_eq!(renders[0].state, EngineState::Idle);
        host.0.surfaces.0.lock().expect("surfaces").clear();
    }

    /// A status answer taken before a concurrent *Pause* and published after it is dropped;
    /// the pause's view already carries the new status.
    #[test]
    fn status_publish_is_ordered_with_a_concurrent_command() {
        let host = launched(NotificationStatus::NotDetermined);
        with_recorder(&host);
        run_action_on(&host, start(Preset::Classic)).expect("starts");
        host.log().take();

        let (taken, has_taken) = channel();
        let (go, may_publish) = channel::<()>();
        let answer = {
            let host = host.clone();
            thread::spawn(move || {
                let (seq, view) = {
                    let service = host.service().expect("service");
                    apply_status(
                        &mut lock(service),
                        NotificationStatus::Granted,
                        host.now_ms(),
                    )
                    .expect("changed")
                };
                assert_eq!(view.state, EngineState::Running);
                taken.send(()).unwrap();
                may_publish.recv_timeout(WAIT).expect("released");
                publish_view(&host, seq, &view);
            })
        };
        has_taken.recv_timeout(WAIT).expect("the status was stored");
        let menu = {
            let host = host.clone();
            thread::spawn(move || run_action_on(&host, Action::Pause))
        };
        menu.join().unwrap().expect("pauses");
        go.send(()).unwrap();
        answer.join().expect("no panic while publishing");

        let events = host.log().take();
        let ticks = ticks(&events);
        assert_eq!(ticks.len(), 1, "{events:?}");
        assert_eq!(ticks[0].state, EngineState::Paused);
        assert_eq!(ticks[0].notifications, NotificationStatus::Granted);
        assert!(
            renders(&events)
                .iter()
                .all(|view| view.state == EngineState::Paused),
            "{events:?}"
        );
        host.0.surfaces.0.lock().expect("surfaces").clear();
    }

    #[test]
    fn publish_view_drops_a_view_not_newer_than_the_last() {
        let host = launched(NotificationStatus::Denied);
        with_recorder(&host);
        let view = lock(&host.0.service).view(T0);
        publish_view(&host, 5, &view);
        publish_view(&host, 5, &view);
        publish_view(&host, 4, &view);
        assert_eq!(ticks(&host.log().take()).len(), 1);
        publish_view(&host, 6, &view);
        assert_eq!(ticks(&host.log().take()).len(), 1);
        host.0.surfaces.0.lock().expect("surfaces").clear();
    }
}
