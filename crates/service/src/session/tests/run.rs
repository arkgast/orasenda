//! The run_* entry points, publish panics and setup.

use std::sync::{Arc, Mutex};
use std::thread;

use orasenda_core::{EndReason, EngineState, NotificationStatus, Preset, format_clock};

use super::super::test_support::*;
use super::super::*;
use crate::api::{
    MilestoneKind, Settings, SettingsErrorKind, StoreStatus, Theme, TimerCommandErrorKind,
    TimerView,
};

#[test]
fn run_action_start_makes_a_uuid_v7() {
    let host = TestHost::new(NotificationStatus::Denied);
    let view = run_action_on(&host, start(Preset::Classic)).expect("starts");
    let id = view.session_id.expect("an id").0;
    let uuid = uuid::Uuid::parse_str(&id).expect("a UUID");
    assert_eq!(uuid.get_version_num(), 7);
}

#[test]
fn run_action_publishes_effects_on_error() {
    let host = TestHost::new(NotificationStatus::Granted);
    read_and_clear(&host);
    run_action_on(&host, start(Preset::Classic)).expect("starts");
    host.log().take();
    host.set_now(T0 + CLASSIC_MS + 5_000);
    let error = run_action_on(&host, Action::Pause).expect_err("nothing running");
    assert_eq!(error.kind, TimerCommandErrorKind::NothingRunning);
    let events = host.log().take();
    let idle_ticks: Vec<_> = events
        .iter()
        .filter(|e| matches!(e, Event::Tick(view) if view.state == EngineState::Idle))
        .collect();
    assert_eq!(idle_ticks.len(), 1, "{events:?}");
    let position = |wanted: &dyn Fn(&Event) -> bool| {
        events
            .iter()
            .position(wanted)
            .unwrap_or_else(|| panic!("missing in {events:?}"))
    };
    let tick = position(&|e| matches!(e, Event::Tick(_)));
    let posted = position(&|e| matches!(e, Event::Posted(..)));
    let released = position(&|e| *e == Event::Released);
    let ended = position(&|e| matches!(e, Event::Milestone(m) if m.kind == MilestoneKind::Ended));
    assert!(
        tick < posted && posted < released && released < ended,
        "{events:?}"
    );
}

/// Runs the launch read so the host's service knows the fake's status, then clears the log.
fn read_and_clear(host: &TestHost) {
    crate::scheduler::read_launch_status(host);
    host.log().take();
}

#[test]
fn run_state_publishes_and_drains() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    let back = relaunch(&mut s, T0 + 60 * MINUTE);
    let Fakes { log, notifier, .. } = fakes(NotificationStatus::Denied, false);
    let host = TestHost::with(back, log, notifier);
    let state = run_state(&host);
    assert_eq!(state.pending.len(), 1);
    assert!(run_state(&host).pending.is_empty());
    assert_eq!(
        host.log()
            .count(|e| matches!(e, Event::Milestone(m) if m.kind == MilestoneKind::Recovered)),
        0
    );
}

#[test]
fn run_set_settings_write_failure_publishes_one_unavailable_timer_tick() {
    let host = TestHost::fresh(NotificationStatus::Denied);
    db(&lock(&host.0.service)).fail_writes(true);
    host.log().take();
    let err = run_set_settings(&host, fifty_ten()).expect_err("the write fails");
    assert_eq!(err.kind, SettingsErrorKind::Write);
    let events = host.log().take();
    let ticks = tick_views(&events);
    assert_eq!(ticks.len(), 1, "{events:?}");
    assert_eq!(ticks[0].state, EngineState::Idle);
    assert_eq!(ticks[0].store, StoreStatus::Unavailable);
    assert_eq!(
        events
            .iter()
            .filter(|e| matches!(e, Event::Clock(_)))
            .count(),
        0
    );
    assert_eq!(current_settings(&host), Settings::default());
}

#[test]
fn run_set_settings_flushing_what_was_owed_publishes_one_ok_timer_tick() {
    let host = TestHost::new(NotificationStatus::Denied);
    run_action_on(&host, start(Preset::Classic)).expect("starts");
    db(&lock(&host.0.service)).fail_writes(true);
    run_action_on(&host, Action::Stop).expect("stops");
    db(&lock(&host.0.service)).fail_writes(false);
    host.log().take();
    run_set_settings(&host, fifty_ten()).expect("saves");
    let events = host.log().take();
    let ticks = tick_views(&events);
    assert_eq!(ticks.len(), 1, "{events:?}");
    assert_eq!(ticks[0].state, EngineState::Idle);
    assert_eq!(ticks[0].store, StoreStatus::Ok);
    assert_eq!(
        events
            .iter()
            .filter(|e| matches!(e, Event::Clock(_)))
            .count(),
        1
    );
    assert!(!lock(&host.0.service).snapshot_dirty);
}

#[test]
fn run_set_settings_without_a_store_change_publishes_no_timer_tick() {
    let host = TestHost::new(NotificationStatus::Denied);
    let count = |host: &TestHost| {
        let events = host.log().take();
        (
            tick_views(&events).len(),
            events
                .iter()
                .filter(|e| matches!(e, Event::Clock(_)))
                .count(),
        )
    };
    host.log().take();
    run_set_settings(&host, fifty_ten()).expect("saves");
    assert_eq!(count(&host), (0, 1));

    let quick = Settings {
        theme: Theme::System,
        preset: Preset::Quick,
        ..Settings::default()
    };
    assert!(run_set_settings(&host, quick).is_err());
    assert_eq!(count(&host), (0, 0));

    db(&lock(&host.0.service)).fail_writes(true);
    assert!(run_set_settings(&host, Settings::default()).is_err());
    assert_eq!(count(&host), (1, 0));
    assert!(run_set_settings(&host, Settings::default()).is_err());
    assert_eq!(count(&host), (0, 0));
}

#[test]
fn run_set_settings_after_a_failed_settings_read_publishes_one_ok_timer_tick() {
    let mut s = service();
    let read = failing_read(&s, read_settings);
    s.load_settings(read);
    assert_eq!(s.view(T0).store, StoreStatus::Unavailable);
    let Fakes {
        platform,
        log,
        notifier,
    } = fakes(NotificationStatus::Denied, false);
    let _ = platform;
    let host = TestHost::with(s, log, notifier);
    host.log().take();
    run_set_settings(&host, fifty_ten()).expect("saves");
    let events = host.log().take();
    let ticks = tick_views(&events);
    assert_eq!(ticks.len(), 1, "{events:?}");
    assert_eq!(ticks[0].store, StoreStatus::Ok);
    assert_eq!(
        events
            .iter()
            .filter(|e| matches!(e, Event::Clock(_)))
            .count(),
        1
    );
}

#[test]
fn run_set_settings_publishes_one_clock_tick() {
    let host = TestHost::new(NotificationStatus::Denied);
    let changed = Settings {
        theme: Theme::System,
        preset: Preset::FiftyTen,
        ..Settings::default()
    };
    run_set_settings(&host, changed.clone()).expect("saves");
    let events = host.log().take();
    let clocks: Vec<_> = events
        .iter()
        .filter_map(|e| match e {
            Event::Clock(tick) => Some(tick.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(clocks.len(), 1, "{events:?}");
    assert_eq!(
        clocks[0].idle_finish,
        Some(format_clock(T0 + 50 * MINUTE, OFFSET_MIN, CYCLE))
    );
    assert_eq!(current_settings(&host), changed);

    let refused = run_set_settings(
        &host,
        Settings {
            theme: Theme::System,
            preset: Preset::Quick,
            ..Settings::default()
        },
    );
    assert!(refused.is_err());
    assert_eq!(host.log().count(|e| matches!(e, Event::Clock(_))), 0);
}

#[test]
fn flush_on_exit_writes_what_is_owed() {
    let host = TestHost::new(NotificationStatus::Denied);
    run_action_on(&host, start(Preset::Classic)).expect("starts");
    db(&lock(&host.0.service)).fail_writes(true);
    host.set_now(T0 + MINUTE);
    run_action_on(&host, Action::Stop).expect("stops");
    db(&lock(&host.0.service)).fail_writes(false);
    flush_on_exit(&host);
    let service = lock(&host.0.service);
    assert!(service.unsaved.is_empty());
    assert!(!service.snapshot_dirty);
}

#[test]
fn poisoned_service_lock_is_recovered() {
    let service = Arc::new(Mutex::new(service()));
    let poisoner = {
        let service = Arc::clone(&service);
        thread::spawn(move || {
            let _held = service.lock().expect("not poisoned yet");
            panic!("poison the lock");
        })
    };
    assert!(poisoner.join().is_err());
    assert!(service.is_poisoned());
    assert_eq!(lock(&service).view(T0).state, EngineState::Idle);
}

fn with_panicking_surface(host: &TestHost) {
    host.0
        .surfaces
        .0
        .lock()
        .expect("surfaces")
        .push(Arc::new(PanickingSurface));
}

#[test]
fn run_action_returns_its_result_when_publish_panics() {
    let host = TestHost::new(NotificationStatus::Denied);
    with_panicking_surface(&host);
    let started = run_action_on(&host, start(Preset::Classic)).expect("the start committed");
    assert_eq!(started.state, EngineState::Running);
    let paused = run_action_on(&host, Action::Pause).expect("the pause committed");
    assert_eq!(paused.state, EngineState::Paused);
}

#[test]
fn run_state_returns_pending_when_publish_panics() {
    let mut s = service();
    s.apply(start(Preset::Classic), T0, id("a"));
    let mut back = relaunch(&mut s, T0 + 60 * MINUTE);
    back.apply(start(Preset::Classic), T0 + 60 * MINUTE, id("b"));
    let Fakes { log, notifier, .. } = fakes(NotificationStatus::Denied, false);
    let host = TestHost::with(back, log, notifier);
    host.set_now(T0 + 60 * MINUTE);
    with_panicking_surface(&host);
    let state = run_state(&host);
    assert_eq!(state.view.state, EngineState::Running);
    assert_eq!(
        state.pending,
        [milestone(
            MilestoneKind::Recovered,
            Some(EndReason::Completed),
            "a"
        )]
    );
}

#[test]
fn run_set_settings_returns_ok_when_publish_panics() {
    let host = TestHost::new(NotificationStatus::Denied);
    run_action_on(&host, start(Preset::Classic)).expect("starts");
    db(&lock(&host.0.service)).fail_writes(true);
    run_action_on(&host, Action::Stop).expect("stops");
    db(&lock(&host.0.service)).fail_writes(false);
    assert_eq!(lock(&host.0.service).store_status, StoreStatus::Unavailable);
    with_panicking_surface(&host);
    run_set_settings(&host, fifty_ten()).expect("the save committed");
    assert_eq!(current_settings(&host), fifty_ten());
    let service = lock(&host.0.service);
    assert_eq!(service.store_status, StoreStatus::Ok);
    assert!(!service.snapshot_dirty);
}

#[test]
fn run_set_settings_returns_its_write_error_when_publish_panics() {
    let host = TestHost::fresh(NotificationStatus::Denied);
    with_panicking_surface(&host);
    db(&lock(&host.0.service)).fail_writes(true);
    let err = run_set_settings(&host, fifty_ten()).expect_err("the write fails");
    assert_eq!(err.kind, SettingsErrorKind::Write);
    assert_eq!(current_settings(&host), Settings::default());
}

#[test]
fn setup_creates_app_data_dir() {
    let root = std::env::temp_dir().join(format!("orasenda-setup-{}-{}", std::process::id(), T0));
    let dir = root.join("Application Support").join("com.veloud.orasenda");
    assert!(!dir.exists());
    let store = open_store_at(&dir, "device-a").expect("a fresh install opens");
    assert_eq!(store.device_id(), "device-a");
    assert!(dir.join("orasenda.db").is_file());
    drop(store);
    std::fs::remove_dir_all(&root).expect("temp dir removed");
}

// ---- Spec B: notify review, diff save, theme and settings-changed ----

/// Panics on every render.
struct PanickingSurface;

impl NativeSurface for PanickingSurface {
    fn render(&self, _view: &TimerView) {
        panic!("a surface failed");
    }
}
