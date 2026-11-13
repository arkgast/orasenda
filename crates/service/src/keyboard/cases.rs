//! The keyboard service's cases, over the [`FakeRegistrar`].

use orasenda_core::NotificationStatus;
use orasenda_store::meta;

use std::sync::Arc;

use super::*;
use crate::api::StartRequest;
use crate::api::{KeyboardError, KeyboardView, ShortcutStatus, TimerView};
use crate::scheduler::Host;
use crate::session::test_support::*;
use crate::session::{Action, current_settings, lock, run_action_on, run_view};
use orasenda_core::EngineState;

const F: &str = "Control+Alt+KeyF";
const N: &str = "Control+Alt+KeyN";

struct Rig {
    host: TestHost,
    registrar: Arc<FakeRegistrar>,
    kb: KeyboardService,
}

fn rig() -> Rig {
    let host = TestHost::fresh(NotificationStatus::Granted);
    let registrar = Arc::new(FakeRegistrar::default());
    let kb = KeyboardService::new(registrar.clone());
    Rig {
        host,
        registrar,
        kb,
    }
}

fn stored_keys(host: &TestHost, id: ShortcutId) -> String {
    let key = match id {
        ShortcutId::StartPause => "keys.start_pause",
        ShortcutId::Capture => "keys.capture",
    };
    let service = lock(host.service().expect("service"));
    db(&service)
        .read(|txn| orasenda_store::settings::get::<String>(txn, key))
        .expect("reads")
        .unwrap_or_default()
}

fn view(r: &Rig) -> KeyboardView {
    r.kb.view(&r.host)
}

#[test]
fn accelerator_round_trip() {
    let acc = Accelerator::parse("Alt+Control+KeyF").expect("parses in any order");
    assert_eq!(acc.canonical(), F);
    assert_eq!(acc.describe(), "⌃⌥F");
    assert_eq!(acc.spoken(), "Control-Option-F");
    let all = Accelerator::parse("Control+Alt+Shift+Super+Space").expect("parses");
    assert_eq!(all.describe(), "⌃⌥⇧⌘Space");
    assert_eq!(all.spoken(), "Control-Option-Shift-Command-Space");
    // Every code the recorder emits: the exact glyph and spoken word of the Kbd key table.
    let mut table: Vec<(String, String, String)> = ('A'..='Z')
        .map(|c| (format!("Key{c}"), c.to_string(), c.to_string()))
        .collect();
    table.extend((0..=9).map(|d| (format!("Digit{d}"), d.to_string(), d.to_string())));
    for (code, glyph, spoken) in [
        ("Period", ".", "Period"),
        ("Comma", ",", "Comma"),
        ("Enter", "↩", "Return"),
        ("Space", "Space", "Space"),
        ("Tab", "Tab", "Tab"),
        ("Backspace", "⌫", "Delete"),
        ("ArrowLeft", "←", "Left Arrow"),
        ("ArrowUp", "↑", "Up Arrow"),
        ("ArrowRight", "→", "Right Arrow"),
        ("ArrowDown", "↓", "Down Arrow"),
    ] {
        table.push((code.into(), glyph.into(), spoken.into()));
    }
    for (code, glyph, spoken) in table {
        let text = format!("Control+Alt+{code}");
        let acc = Accelerator::parse(&text).unwrap_or_else(|e| panic!("{text}: {e:?}"));
        assert_eq!(acc.canonical(), text);
        assert_eq!(Accelerator::parse(&acc.canonical()), Ok(acc.clone()));
        assert_eq!(acc.describe(), format!("⌃⌥{glyph}"), "{text}");
        assert_eq!(acc.spoken(), format!("Control-Option-{spoken}"), "{text}");
    }
    for out in ["F5", "Numpad1", "Home", "Minus", "Delete"] {
        let text = format!("Control+Alt+{out}");
        assert!(
            Accelerator::parse(&text).is_err(),
            "{text} is not a recorder key"
        );
    }
    for bad in [
        "",
        "KeyF",
        "Shift+KeyF",
        "Control+",
        "Control+Hyper+KeyF",
        "Control+Alt+Nope",
        "Control+Control+KeyF",
    ] {
        assert!(Accelerator::parse(bad).is_err(), "{bad:?} must not parse");
    }
}

#[test]
fn set_shortcut_registers_before_save() {
    let r = rig();
    r.kb.register_saved(&r.host);
    assert_eq!(view(&r).start_pause.status, ShortcutStatus::Registered);
    let host = r.host.clone();
    r.registrar
        .set_probe(Box::new(move || current_settings(&host).start_pause_keys));
    r.host.log().take();
    let out =
        r.kb.set_shortcut(
            &r.host,
            ShortcutId::StartPause,
            Some("Control+Alt+KeyG".into()),
        )
        .expect("changes");
    assert_eq!(
        r.registrar.calls().split_off(2),
        [
            "register StartPause Control+Alt+KeyG",
            "unregister StartPause"
        ]
    );
    // The new one registered while the old was still saved; the old was dropped once the
    // new was saved.
    assert_eq!(r.registrar.probed(), [F, "Control+Alt+KeyG"]);
    assert_eq!(
        r.registrar.live(ShortcutId::StartPause),
        ["Control+Alt+KeyG"]
    );
    assert_eq!(out.start_pause.keys.as_deref(), Some("Control+Alt+KeyG"));
    assert_eq!(out.start_pause.display.as_deref(), Some("⌃⌥G"));
    assert_eq!(out.start_pause.status, ShortcutStatus::Registered);
    assert_eq!(
        current_settings(&r.host).start_pause_keys,
        "Control+Alt+KeyG"
    );
    let events = r.host.log().take();
    let changed = events
        .iter()
        .position(|e| matches!(e, Event::KeyboardChanged(v) if *v == out))
        .expect("keyboard-changed is emitted");
    assert!(events.iter().any(
        |e| matches!(e, Event::SettingsChanged(s) if s.start_pause_keys == "Control+Alt+KeyG")
    ));
    assert_eq!(
        changed,
        events
            .iter()
            .position(|e| matches!(e, Event::KeyboardChanged(_)))
            .unwrap()
    );
    // Off unregisters and saves "off".
    let off =
        r.kb.set_shortcut(&r.host, ShortcutId::StartPause, None)
            .expect("off");
    assert_eq!(off.start_pause.keys, None);
    assert_eq!(off.start_pause.status, ShortcutStatus::Off);
    assert_eq!(stored_keys(&r.host, ShortcutId::StartPause), "off");
    assert!(r.registrar.live(ShortcutId::StartPause).is_empty());
}

#[test]
fn set_shortcut_unavailable_saves_nothing_keeps_old() {
    let r = rig();
    r.kb.register_saved(&r.host);
    r.registrar.set_failing(true);
    r.host.log().take();
    let err =
        r.kb.set_shortcut(
            &r.host,
            ShortcutId::StartPause,
            Some("Control+Alt+KeyG".into()),
        )
        .expect_err("the registrar refuses");
    assert_eq!(err, KeyboardError::Unavailable);
    assert_eq!(current_settings(&r.host).start_pause_keys, F);
    assert_eq!(r.registrar.live(ShortcutId::StartPause), [F]);
    assert_eq!(view(&r).start_pause.status, ShortcutStatus::Registered);
    assert_eq!(
        r.registrar.calls().last().map(String::as_str),
        Some("register StartPause Control+Alt+KeyG")
    );
    assert!(r.host.log().take().is_empty(), "nothing is emitted");
}

#[test]
fn set_shortcut_save_failure_restores_the_old_keys() {
    let r = rig();
    r.kb.register_saved(&r.host);
    db(&lock(r.host.service().expect("service"))).fail_writes(true);
    let err =
        r.kb.set_shortcut(
            &r.host,
            ShortcutId::StartPause,
            Some("Control+Alt+KeyG".into()),
        )
        .expect_err("the save fails");
    assert_eq!(err, KeyboardError::Store);
    assert_eq!(r.registrar.live(ShortcutId::StartPause), [F]);
    assert_eq!(current_settings(&r.host).start_pause_keys, F);
    assert_eq!(view(&r).start_pause.status, ShortcutStatus::Registered);
    // From off, a failed save leaves nothing registered.
    db(&lock(r.host.service().expect("service"))).fail_writes(false);
    r.kb.set_shortcut(&r.host, ShortcutId::Capture, None)
        .expect("off");
    db(&lock(r.host.service().expect("service"))).fail_writes(true);
    let err =
        r.kb.set_shortcut(&r.host, ShortcutId::Capture, Some(N.into()))
            .expect_err("the save fails");
    assert_eq!(err, KeyboardError::Store);
    assert!(r.registrar.live(ShortcutId::Capture).is_empty());
    assert_eq!(view(&r).capture.status, ShortcutStatus::Off);
}

#[test]
fn set_shortcut_in_use_by_orasenda() {
    let r = rig();
    r.kb.register_saved(&r.host);
    for taken in [
        N,
        "Super+KeyK",
        "Shift+Super+KeyF",
        "Shift+Super+KeyT",
        "Super+Comma",
        "Super+Enter",
        "Shift+Super+Enter",
        "Super+Period",
    ] {
        let err =
            r.kb.set_shortcut(&r.host, ShortcutId::StartPause, Some(taken.into()))
                .expect_err(taken);
        assert_eq!(err, KeyboardError::InUseByOrasenda, "{taken}");
    }
    let err =
        r.kb.set_shortcut(&r.host, ShortcutId::Capture, Some(F.into()))
            .expect_err("the other global");
    assert_eq!(err, KeyboardError::InUseByOrasenda);
    let invalid =
        r.kb.set_shortcut(&r.host, ShortcutId::Capture, Some("KeyZ".into()))
            .expect_err("no modifier");
    assert_eq!(invalid, KeyboardError::Invalid);
    assert_eq!(
        r.registrar.calls().len(),
        2,
        "only the launch registrations"
    );
    assert_eq!(stored_keys(&r.host, ShortcutId::StartPause), "");
}

#[test]
fn restore_default_same_path() {
    let r = rig();
    r.kb.register_saved(&r.host);
    r.kb.set_shortcut(
        &r.host,
        ShortcutId::Capture,
        Some("Control+Alt+KeyM".into()),
    )
    .expect("changes");
    let back =
        r.kb.restore_default(&r.host, ShortcutId::Capture)
            .expect("restores");
    assert_eq!(back.capture.keys.as_deref(), Some(N));
    assert_eq!(r.registrar.live(ShortcutId::Capture), [N]);
    assert_eq!(current_settings(&r.host).capture_keys, N);
    // A failing registrar fails the restore the same way.
    r.kb.set_shortcut(&r.host, ShortcutId::Capture, None)
        .expect("off");
    r.registrar.set_failing(true);
    let err =
        r.kb.restore_default(&r.host, ShortcutId::Capture)
            .expect_err("fails");
    assert_eq!(err, KeyboardError::Unavailable);
    assert_eq!(current_settings(&r.host).capture_keys, "off");
}

#[test]
fn register_saved_failed_status() {
    let r = rig();
    r.kb.set_shortcut(&r.host, ShortcutId::Capture, None)
        .expect("off");
    r.registrar.set_failing(true);
    let writes_before = stored_keys(&r.host, ShortcutId::StartPause);
    r.kb.register_saved(&r.host);
    let v = view(&r);
    assert_eq!(v.start_pause.status, ShortcutStatus::Failed);
    assert_eq!(
        v.start_pause.keys.as_deref(),
        Some(F),
        "the saved keys stay"
    );
    assert_eq!(v.start_pause.display.as_deref(), Some("⌃⌥F"));
    assert_eq!(v.capture.status, ShortcutStatus::Off);
    assert_eq!(v.capture.keys, None);
    assert_eq!(stored_keys(&r.host, ShortcutId::StartPause), writes_before);
    r.registrar.set_failing(false);
    r.kb.register_saved(&r.host);
    assert_eq!(view(&r).start_pause.status, ShortcutStatus::Registered);
}

fn state_of(r: &Rig) -> (EngineState, orasenda_core::Phase) {
    let v: TimerView = run_view(&r.host);
    (v.state, v.phase)
}

#[test]
fn start_pause_toggle_each_state() {
    use orasenda_core::Phase;
    let r = rig();
    let at = |ms: u64| r.host.set_now(T0 + ms);
    assert_eq!(state_of(&r).0, EngineState::Idle);
    r.kb.on_pressed(&r.host, ShortcutId::StartPause);
    assert_eq!(state_of(&r), (EngineState::Running, Phase::Focus));
    at(MINUTE);
    r.kb.on_pressed(&r.host, ShortcutId::StartPause);
    assert_eq!(state_of(&r).0, EngineState::Paused);
    at(2 * MINUTE);
    r.kb.on_pressed(&r.host, ShortcutId::StartPause);
    assert_eq!(state_of(&r), (EngineState::Running, Phase::Focus));
    // The focus ends on its own; the press pauses the break, then resumes it.
    at(CLASSIC_MS + 3 * MINUTE);
    r.kb.on_pressed(&r.host, ShortcutId::StartPause);
    assert_eq!(state_of(&r), (EngineState::Paused, Phase::Break));
    r.kb.on_pressed(&r.host, ShortcutId::StartPause);
    assert_eq!(state_of(&r), (EngineState::Running, Phase::Break));
    // The break is over: the press starts the selected preset again.
    at(CLASSIC_END_MS + 10 * MINUTE);
    r.kb.on_pressed(&r.host, ShortcutId::StartPause);
    let v = run_view(&r.host);
    assert_eq!((v.state, v.phase), (EngineState::Running, Phase::Focus));
    assert_eq!(v.preset_id, Some(current_settings(&r.host).preset_id));
}

#[test]
fn start_pause_press_with_a_start_in_flight_pauses() {
    use orasenda_core::Phase;
    let r = rig();
    // A Start lands at the same moment, just before the press: the press sees Running.
    let started =
        run_action_on(&r.host, Action::Start(StartRequest { quick: false })).expect("starts");
    r.kb.on_pressed(&r.host, ShortcutId::StartPause);
    let v = run_view(&r.host);
    assert_eq!((v.state, v.phase), (EngineState::Paused, Phase::Focus));
    assert_eq!(v.session_id, started.session_id, "no second start");
    // Two threads, one Start and one press: exactly one session is started.
    let r = Arc::new(rig());
    let press = {
        let r = Arc::clone(&r);
        std::thread::spawn(move || r.kb.on_pressed(&r.host, ShortcutId::StartPause))
    };
    let _ = run_action_on(&r.host, Action::Start(StartRequest { quick: false }));
    press.join().expect("press thread");
    let v = run_view(&r.host);
    assert!(matches!(
        v.state,
        EngineState::Running | EngineState::Paused
    ));
    // Every view published after the first start names the same session.
    let ids: std::collections::BTreeSet<String> = r
        .host
        .log()
        .take()
        .into_iter()
        .filter_map(|e| match e {
            Event::Tick(v) | Event::Render(v) => v.session_id.map(|id| format!("{id:?}")),
            _ => None,
        })
        .collect();
    assert_eq!(ids.len(), 1, "exactly one session was started: {ids:?}");
}

#[test]
fn start_pause_sets_used_flag_once() {
    let r = rig();
    let flag = |host: &TestHost| {
        let service = lock(host.service().expect("service"));
        db(&service)
            .read(|txn| meta::get(txn, "used.global_shortcut"))
            .expect("reads")
    };
    assert_eq!(flag(&r.host), None);
    r.kb.on_pressed(&r.host, ShortcutId::StartPause);
    let first = flag(&r.host).expect("set by the first press");
    r.host.set_now(T0 + 5 * MINUTE);
    r.kb.on_pressed(&r.host, ShortcutId::StartPause);
    assert_eq!(flag(&r.host), Some(first), "never rewritten");
    // The capture key does not set it.
    let other = rig();
    other.kb.on_pressed(&other.host, ShortcutId::Capture);
    assert_eq!(flag(&other.host), None);
}

#[test]
fn capture_press_calls_the_opener() {
    let r = rig();
    r.kb.on_pressed(&r.host, ShortcutId::Capture);
    let opened = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let seen = Arc::clone(&opened);
    r.kb.set_capture_opener(Arc::new(move || {
        seen.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    }));
    r.kb.on_pressed(&r.host, ShortcutId::Capture);
    assert_eq!(opened.load(std::sync::atomic::Ordering::SeqCst), 1);
}

#[test]
fn voice_over_is_in_the_view_and_emits_once() {
    let r = rig();
    r.host.log().take();
    r.kb.set_voice_over(&r.host, true);
    r.kb.set_voice_over(&r.host, true);
    assert!(view(&r).voice_over);
    assert_eq!(
        r.host
            .log()
            .count(|e| matches!(e, Event::KeyboardChanged(_))),
        1
    );
}
