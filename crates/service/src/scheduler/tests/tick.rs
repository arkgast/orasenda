//! Ticks, status reads and the end notification.

use super::*;

#[test]
fn ending_tick_publishes_idle_view_once_and_lists_ended_effects() {
    let host = launched(NotificationStatus::Granted);
    with_recorder(&host);
    run_action_on(&host, start()).expect("starts");
    host.log().take();
    host.set_now(T0 + 1_000);
    iterate(&host);
    let running = host.log().take();
    assert!(matches!(running[0], Event::Clock(_)), "{running:?}");
    assert_eq!(ticks(&running).len(), 1);
    assert_eq!(ticks(&running)[0].state, EngineState::Running);

    host.set_now(T0 + CLASSIC_END_MS);
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
            Event::PresetsChanged(_) => "presets",
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
        run_action_on(&host, start()).expect("starts");
        assert_eq!(
            host.log().count(|e| *e == Event::Requested),
            0,
            "{status:?}"
        );
    }
    let unread = TestHost::new(NotificationStatus::NotDetermined);
    run_action_on(&unread, start()).expect("starts");
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
    run_action_on(&completed, start()).expect("starts");
    completed.set_now(T0 + CLASSIC_END_MS);
    iterate(&completed);
    assert_eq!(completed.log().count(|e| *e == expected), 1);

    let stopped = launched(NotificationStatus::Granted);
    run_action_on(&stopped, start()).expect("starts");
    run_action_on(&stopped, Action::Stop).expect("stops");
    assert_eq!(stopped.log().count(|e| matches!(e, Event::Posted(..))), 0);

    let denied = launched(NotificationStatus::Denied);
    run_action_on(&denied, start()).expect("starts");
    denied.set_now(T0 + CLASSIC_END_MS);
    iterate(&denied);
    assert_eq!(denied.log().count(|e| matches!(e, Event::Posted(..))), 0);
    assert_eq!(denied.log().count(|e| *e == Event::Requested), 0);

    let disabled = launched(NotificationStatus::Granted);
    lock(&disabled.0.service)
        .set_settings(
            crate::api::Settings {
                notify_session_end: false,
                ..crate::api::Settings::default()
            },
            T0,
        )
        .expect("saves");
    run_action_on(&disabled, start()).expect("starts");
    disabled.set_now(T0 + CLASSIC_END_MS);
    iterate(&disabled);
    assert_eq!(disabled.log().count(|e| matches!(e, Event::Posted(..))), 0);
    assert_eq!(disabled.log().count(|e| *e == Event::StatusRead), 0);
}

#[test]
fn end_rereads_status_before_posting_and_publishes_the_change() {
    let host = launched(NotificationStatus::NotDetermined);
    run_action_on(&host, start()).expect("starts");
    // Granted later in System Settings; the request is never answered.
    host.0.notifier.set_status(NotificationStatus::Granted);
    host.log().take();
    host.set_now(T0 + CLASSIC_END_MS);
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
    run_action_on(&host, start()).expect("starts");
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
    run_action_on(&host, start()).expect("starts");
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

    run_action_on(&host, start()).expect("starts");
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
