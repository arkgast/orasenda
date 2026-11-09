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
use crate::ipc::{MilestoneEvent, TimerView};
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
/// the surfaces, the end notification, the guard drop, the milestones, the permission
/// request.
pub fn publish<H: Host>(host: &H, effects: Effects) {
    let Effects {
        view,
        was_idle,
        store_changed,
        milestones,
        ended,
        notify_session_end,
        drop_after_unlock,
        request_notifications,
        seq,
        ..
    } = effects;
    if !was_idle || view.state != EngineState::Idle || store_changed {
        publish_view(host, seq, &view);
    }
    let completed = ended.is_some_and(|record| record.end_reason == EndReason::Completed);
    if completed && notify_session_end {
        notify_end(host);
    }
    drop(drop_after_unlock);
    for milestone in &milestones {
        host.emit_milestone(milestone);
    }
    if request_notifications {
        request_permission(host);
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

/// Asks for the permission when it is not determined, reading the status first if the
/// launch read has not finished. Never waits for the answer.
fn request_permission<H: Host>(host: &H) {
    let Some(service) = host.service() else {
        return;
    };
    let notifier = host.notifier();
    let known = lock(service).notifications();
    let status = match known {
        Some(status) => status,
        None => {
            let status = notifier.status();
            store_status(host, status);
            status
        }
    };
    if status != NotificationStatus::NotDetermined {
        return;
    }
    let answered = host.clone();
    notifier.request(Box::new(move |answer| store_status(&answered, answer)));
}

/// Stores a status read or answer; emits one `timer-tick` when the shown status changed,
/// in every state (plan amendment 4).
pub(crate) fn store_status<H: Host>(host: &H, status: NotificationStatus) {
    if let Some((seq, view)) = status_snapshot(host, status) {
        publish_view(host, seq, &view);
    }
}

/// Stores `status` under the service lock; the numbered view to publish when it changed.
pub(crate) fn status_snapshot<H: Host>(
    host: &H,
    status: NotificationStatus,
) -> Option<(u64, TimerView)> {
    let service = host.service()?;
    let mut service = lock(service);
    service
        .set_notifications(status)
        .then(|| service.snapshot(host.now_ms()))
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
    fn request_made_only_when_not_determined() {
        for (status, expected) in [
            (NotificationStatus::NotDetermined, 1),
            (NotificationStatus::Granted, 0),
            (NotificationStatus::Denied, 0),
            (NotificationStatus::Unavailable, 0),
        ] {
            let host = launched(status);
            run_action_on(&host, start(Preset::Classic)).expect("starts");
            assert_eq!(
                host.log().count(|e| *e == Event::Requested),
                expected,
                "{status:?}"
            );
            assert_eq!(
                host.log().count(|e| *e == Event::StatusRead),
                0,
                "already read"
            );
        }
    }

    #[test]
    fn start_before_status_read_still_requests() {
        let host = TestHost::new(NotificationStatus::NotDetermined);
        let view = run_action_on(&host, start(Preset::Classic)).expect("starts");
        assert_eq!(view.state, EngineState::Running);
        let events = host.log().take();
        let read = events.iter().position(|e| *e == Event::StatusRead);
        let requested = events.iter().position(|e| *e == Event::Requested);
        assert!(read.is_some() && read < requested, "{events:?}");
        let status_ticks: Vec<_> = ticks(&events)
            .into_iter()
            .filter(|view| view.notifications == NotificationStatus::NotDetermined)
            .collect();
        assert_eq!(status_ticks.len(), 1, "{events:?}");
        assert_eq!(
            lock(&host.0.service).notifications(),
            Some(NotificationStatus::NotDetermined)
        );
    }

    #[test]
    fn permission_answer_publishes_one_tick_even_while_idle() {
        let host = launched(NotificationStatus::NotDetermined);
        run_action_on(&host, start(Preset::Classic)).expect("starts");
        host.set_now(T0 + 1_000);
        run_action_on(&host, Action::Stop).expect("stops");
        host.log().take();
        host.0.notifier.answer(NotificationStatus::Granted);
        let events = host.log().take();
        let answered = ticks(&events);
        assert_eq!(answered.len(), 1, "{events:?}");
        assert_eq!(answered[0].state, EngineState::Idle);
        assert_eq!(answered[0].notifications, NotificationStatus::Granted);
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
                let (seq, view) =
                    status_snapshot(&host, NotificationStatus::Granted).expect("changed");
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
