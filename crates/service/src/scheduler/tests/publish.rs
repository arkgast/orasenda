//! Publish order, surfaces and the view gate.

use super::*;

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
            run_action_on(&host, start()).expect("starts");
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
    run_action_on(&host, start()).expect("starts");
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

/// The scheduler takes a running view, then a menu *End session* publishes the idle
/// view before the scheduler publishes: the stale running view is dropped.
#[test]
fn stale_tick_view_is_not_published_after_a_newer_command() {
    let host = launched(NotificationStatus::Denied);
    with_recorder(&host);
    run_action_on(&host, start()).expect("starts");
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
    run_action_on(&host, start()).expect("starts");
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
