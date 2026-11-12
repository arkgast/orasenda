//! `run_view` and `run_select_preset`.

use std::sync::{Arc, Barrier};
use std::thread;

use orasenda_core::{EngineState, NotificationStatus, PresetId};

use super::super::test_support::*;
use super::super::*;
use crate::api::{Settings, TimerCommandErrorKind};

fn host() -> TestHost {
    TestHost::fresh(NotificationStatus::NotDetermined)
}

/// The stored `timer.preset`; a fresh library has seeded Steady Focus.
fn saved_preset(host: &TestHost) -> Option<PresetId> {
    db(&lock(&host.0.service))
        .read(|txn| orasenda_store::settings::get(txn, "timer.preset"))
        .expect("reads")
}

#[test]
fn run_view_keeps_pending_and_listening() {
    // A relaunch whose first read failed owes a `recovered` event once the read succeeds.
    let mut s = relaunch_with_reads_failing(T0 + 60 * MINUTE);
    s.tick(T0 + 60 * MINUTE);
    db(&s).fail_reads(false);
    s.tick(T0 + 61 * MINUTE);
    assert_eq!(s.pending.len(), 1, "a recovered event is waiting");
    assert!(!s.listening);
    let Fakes { log, notifier, .. } = fakes(NotificationStatus::Denied, false);
    let host = TestHost::with(s, log, notifier);
    host.set_now(T0 + 62 * MINUTE);

    let view = run_view(&host);

    assert_eq!(view, lock(&host.0.service).view(T0 + 62 * MINUTE));
    {
        let s = lock(&host.0.service);
        assert_eq!(s.pending.len(), 1, "run_view does not drain pending");
        assert!(!s.listening, "run_view does not set listening");
    }
    assert!(host.log().take().is_empty(), "run_view publishes nothing");
    assert_eq!(
        run_state(&host).pending.len(),
        1,
        "run_state still drains it"
    );
    assert!(lock(&host.0.service).listening);
}

#[test]
fn select_preset_idle_saves_only_preset() {
    let host = host();
    run_select_preset(&host, default_id(2)).expect("selects");
    assert_eq!(saved_preset(&host), Some(default_id(2)));
    let events = settings_events(&host);
    assert_eq!(events.len(), 1, "one settings-changed");
    assert_eq!(
        events[0],
        Settings {
            preset_id: default_id(2),
            ..Settings::default()
        }
    );
    let rows: Option<serde_json::Value> = db(&lock(&host.0.service))
        .read(|txn| orasenda_store::settings::get(txn, "ui.theme"))
        .expect("reads");
    assert_eq!(rows, None, "nothing but the preset was written");
}

#[test]
fn select_preset_takes_library_id() {
    let host = host();
    let error = run_select_preset(&host, PresetId("not-in-the-library".into()))
        .expect_err("an unknown id is refused");
    assert_eq!(error.kind, TimerCommandErrorKind::InvalidSpec);
    assert_eq!(saved_preset(&host), Some(default_id(1)));
    assert!(settings_events(&host).is_empty());
    run_select_preset(&host, default_id(0)).expect("a library id is taken");
    assert_eq!(saved_preset(&host), Some(default_id(0)));
}

#[test]
fn select_preset_refused_while_running() {
    let host = host();
    run_action_on(&host, start()).expect("starts");
    host.log().take();
    let error = run_select_preset(&host, default_id(2)).expect_err("refused");
    assert_eq!(error.kind, TimerCommandErrorKind::WrongState);
    assert_eq!(saved_preset(&host), Some(default_id(1)));
    assert!(settings_events(&host).is_empty());

    run_action_on(&host, Action::Pause).expect("pauses");
    let error = run_select_preset(&host, default_id(2)).expect_err("refused when paused");
    assert_eq!(error.kind, TimerCommandErrorKind::WrongState);
    assert_eq!(saved_preset(&host), Some(default_id(1)));
}

#[test]
fn select_preset_failed_save_is_a_store_error() {
    let host = host();
    db(&lock(&host.0.service)).fail_writes(true);
    host.log().take();
    let error = run_select_preset(&host, default_id(2)).expect_err("fails");
    assert_eq!(error.kind, TimerCommandErrorKind::Store);
    assert!(settings_events(&host).is_empty(), "nothing was saved");
}

/// A start and a select race for the lock: whoever takes it first decides, and the select
/// never saves over a running session.
#[test]
fn select_preset_refused_when_start_wins_race() {
    for _ in 0..20 {
        let host = host();
        let barrier = Arc::new(Barrier::new(2));
        let starter = {
            let (host, barrier) = (host.clone(), Arc::clone(&barrier));
            thread::spawn(move || {
                barrier.wait();
                run_action_on(&host, start())
            })
        };
        let selector = {
            let (host, barrier) = (host.clone(), Arc::clone(&barrier));
            thread::spawn(move || {
                barrier.wait();
                run_select_preset(&host, default_id(2))
            })
        };
        starter
            .join()
            .expect("starter joins")
            .expect("start succeeds");
        let selected = selector.join().expect("selector joins");
        match selected {
            Ok(()) => assert_eq!(saved_preset(&host), Some(default_id(2))),
            Err(error) => {
                assert_eq!(error.kind, TimerCommandErrorKind::WrongState);
                assert_eq!(
                    saved_preset(&host),
                    Some(default_id(1)),
                    "a refused select saves nothing"
                );
            }
        }
        assert_eq!(lock(&host.0.service).view(T0).state, EngineState::Running);
    }
}
