//! The keyboard service's cases, over the [`FakeRegistrar`]: registering, register-before-save
//! and the start or pause key. Binding rules are in `cases_binding.rs`.

use orasenda_core::NotificationStatus;
use orasenda_store::{meta, settings};

use std::sync::Arc;

use super::registry::settings_key;
use super::*;
use crate::api::{GlobalBindingView, StartRequest};
use crate::api::{KeyboardError, KeyboardView, ShortcutStatus, TimerView};
use crate::scheduler::Host;
use crate::session::test_support::*;
use crate::session::{Action, current_settings, lock, run_action_on, run_view};
use orasenda_core::EngineState;

/// The pre-H3 default of start or pause, which the fold drops.
pub(super) const LEGACY_F: &str = "Control+Alt+KeyF";
pub(super) const START: &str = "Control+Alt+Super+Space";
pub(super) const CAPTURE: &str = "Control+Alt+Super+KeyN";
pub(super) const FLOATER: &str = "Control+Alt+Super+KeyT";

pub(super) struct Rig {
    pub(super) host: TestHost,
    pub(super) registrar: Arc<FakeRegistrar>,
    pub(super) kb: KeyboardService,
}

pub(super) fn rig() -> Rig {
    let host = TestHost::fresh(NotificationStatus::Granted);
    let registrar = Arc::new(FakeRegistrar::default());
    let kb = KeyboardService::new(registrar.clone());
    Rig {
        host,
        registrar,
        kb,
    }
}

/// The saved row of a binding, `None` when there is none.
pub(super) fn stored(host: &TestHost, id: ActionId, slot: Slot) -> Option<String> {
    let service = lock(host.service().expect("service"));
    db(&service)
        .read(|txn| settings::get::<String>(txn, &settings_key(id, slot)))
        .expect("reads")
}

pub(super) fn view(r: &Rig) -> KeyboardView {
    r.kb.view(&r.host)
}

pub(super) fn global(r: &Rig, id: ActionId) -> GlobalBindingView {
    view(r).action(id).expect("in the registry").global.clone()
}

fn press(r: &Rig) {
    run_action_on(&r.host, Action::StartPauseToggle).expect("toggles");
}

#[test]
fn accelerator_round_trip() {
    let acc = Accelerator::parse("Alt+Control+KeyF").expect("parses in any order");
    assert_eq!(acc.canonical(), LEGACY_F);
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
fn register_saved_registers_the_defaults() {
    let r = rig();
    r.kb.register_saved(&r.host);
    for (id, keys) in [
        (ActionId::StartPause, START),
        (ActionId::Capture, CAPTURE),
        (ActionId::Floater, FLOATER),
    ] {
        assert_eq!(r.registrar.live(id), [keys], "{id:?}");
        assert_eq!(global(&r, id).status, ShortcutStatus::Registered);
        assert!(global(&r, id).binding.is_default);
    }
    let leave = global(&r, ActionId::LeaveFullScreen);
    assert_eq!(leave.status, ShortcutStatus::Off);
    assert_eq!(leave.binding.keys, None);
    assert_eq!(view(&r).fixed.len(), super::registry::FIXED.len());
}

#[test]
fn set_binding_registers_before_save() {
    let r = rig();
    r.kb.register_saved(&r.host);
    let host = r.host.clone();
    r.registrar.set_probe(Box::new(move || {
        stored(&host, ActionId::StartPause, Slot::Global).unwrap_or_default()
    }));
    r.host.log().take();
    let out =
        r.kb.set_binding(
            &r.host,
            ActionId::StartPause,
            Slot::Global,
            Some("Control+Alt+KeyG".into()),
            false,
        )
        .expect("changes");
    assert_eq!(
        r.registrar.calls().split_off(5),
        [
            "register StartPause Control+Alt+KeyG",
            "unregister StartPause"
        ]
    );
    // The new one registered while the old was still unsaved; the old was dropped once the
    // new was saved.
    assert_eq!(r.registrar.probed(), ["", "Control+Alt+KeyG"]);
    assert_eq!(r.registrar.live(ActionId::StartPause), ["Control+Alt+KeyG"]);
    let now = out.action(ActionId::StartPause).expect("listed");
    assert_eq!(now.global.binding.keys.as_deref(), Some("Control+Alt+KeyG"));
    assert_eq!(now.global.binding.display.as_deref(), Some("⌃⌥G"));
    assert_eq!(now.global.status, ShortcutStatus::Registered);
    assert!(!now.global.binding.is_default);
    let events = r.host.log().take();
    assert!(
        events
            .iter()
            .any(|e| matches!(e, Event::KeyboardChanged(v) if *v == out)),
        "keyboard-changed is emitted"
    );
    // Off unregisters and saves "off".
    let off =
        r.kb.set_binding(&r.host, ActionId::StartPause, Slot::Global, None, false)
            .expect("off");
    let now = off.action(ActionId::StartPause).expect("listed");
    assert_eq!(now.global.binding.keys, None);
    assert_eq!(now.global.status, ShortcutStatus::Off);
    assert_eq!(
        stored(&r.host, ActionId::StartPause, Slot::Global).as_deref(),
        Some("off")
    );
    assert!(r.registrar.live(ActionId::StartPause).is_empty());
}

#[test]
fn set_binding_save_failure_restores_the_old_keys() {
    let r = rig();
    r.kb.register_saved(&r.host);
    db(&lock(r.host.service().expect("service"))).fail_writes(true);
    let err =
        r.kb.set_binding(
            &r.host,
            ActionId::StartPause,
            Slot::Global,
            Some("Control+Alt+KeyG".into()),
            false,
        )
        .expect_err("the save fails");
    assert_eq!(err, KeyboardError::Store);
    assert_eq!(r.registrar.live(ActionId::StartPause), [START]);
    assert_eq!(stored(&r.host, ActionId::StartPause, Slot::Global), None);
    assert_eq!(
        global(&r, ActionId::StartPause).status,
        ShortcutStatus::Registered
    );
    // From off, a failed save leaves nothing registered.
    db(&lock(r.host.service().expect("service"))).fail_writes(false);
    r.kb.set_binding(&r.host, ActionId::Capture, Slot::Global, None, false)
        .expect("off");
    db(&lock(r.host.service().expect("service"))).fail_writes(true);
    let err =
        r.kb.set_binding(
            &r.host,
            ActionId::Capture,
            Slot::Global,
            Some(CAPTURE.into()),
            false,
        )
        .expect_err("the save fails");
    assert_eq!(err, KeyboardError::Store);
    assert!(r.registrar.live(ActionId::Capture).is_empty());
    assert_eq!(global(&r, ActionId::Capture).status, ShortcutStatus::Off);
}

#[test]
fn restore_default_same_path() {
    let r = rig();
    r.kb.register_saved(&r.host);
    r.kb.set_binding(
        &r.host,
        ActionId::Capture,
        Slot::Global,
        Some("Control+Alt+KeyM".into()),
        false,
    )
    .expect("changes");
    let back =
        r.kb.restore_default(&r.host, ActionId::Capture, Slot::Global)
            .expect("restores");
    let now = back.action(ActionId::Capture).expect("listed");
    assert_eq!(now.global.binding.keys.as_deref(), Some(CAPTURE));
    assert!(now.global.binding.is_default);
    assert_eq!(r.registrar.live(ActionId::Capture), [CAPTURE]);
    assert_eq!(
        stored(&r.host, ActionId::Capture, Slot::Global).as_deref(),
        Some(CAPTURE),
        "an explicit row holds the default"
    );
    // A failing registrar fails the restore the same way.
    r.kb.set_binding(&r.host, ActionId::Capture, Slot::Global, None, false)
        .expect("off");
    r.registrar.set_failing(true);
    let err =
        r.kb.restore_default(&r.host, ActionId::Capture, Slot::Global)
            .expect_err("fails");
    assert_eq!(err, KeyboardError::Unavailable);
    assert_eq!(
        stored(&r.host, ActionId::Capture, Slot::Global).as_deref(),
        Some("off")
    );
}

#[test]
fn register_saved_failed_status() {
    let r = rig();
    r.kb.set_binding(&r.host, ActionId::Capture, Slot::Global, None, false)
        .expect("off");
    r.registrar.set_failing(true);
    r.kb.register_saved(&r.host);
    let start = global(&r, ActionId::StartPause);
    assert_eq!(start.status, ShortcutStatus::Failed);
    assert_eq!(
        start.binding.keys.as_deref(),
        Some(START),
        "the saved keys stay"
    );
    assert_eq!(start.binding.display.as_deref(), Some("⌃⌥⌘Space"));
    let capture = global(&r, ActionId::Capture);
    assert_eq!(capture.status, ShortcutStatus::Off);
    assert_eq!(capture.binding.keys, None);
    r.registrar.set_failing(false);
    r.kb.register_saved(&r.host);
    assert_eq!(
        global(&r, ActionId::StartPause).status,
        ShortcutStatus::Registered
    );
}

#[test]
fn mark_failed_drops_the_status_and_emits() {
    let r = rig();
    r.kb.register_saved(&r.host);
    r.host.log().take();
    r.kb.mark_failed(&r.host, &[ActionId::Capture]);
    assert_eq!(global(&r, ActionId::Capture).status, ShortcutStatus::Failed);
    assert_eq!(
        global(&r, ActionId::StartPause).status,
        ShortcutStatus::Registered
    );
    assert_eq!(
        r.host
            .log()
            .count(|e| matches!(e, Event::KeyboardChanged(_))),
        1
    );
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
    press(&r);
    assert_eq!(state_of(&r), (EngineState::Running, Phase::Focus));
    at(MINUTE);
    press(&r);
    assert_eq!(state_of(&r).0, EngineState::Paused);
    at(2 * MINUTE);
    press(&r);
    assert_eq!(state_of(&r), (EngineState::Running, Phase::Focus));
    // The focus ends on its own; the press pauses the break, then resumes it.
    at(CLASSIC_MS + 3 * MINUTE);
    press(&r);
    assert_eq!(state_of(&r), (EngineState::Paused, Phase::Break));
    press(&r);
    assert_eq!(state_of(&r), (EngineState::Running, Phase::Break));
    // The break is over: the press starts the selected preset again.
    at(CLASSIC_END_MS + 10 * MINUTE);
    press(&r);
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
    press(&r);
    let v = run_view(&r.host);
    assert_eq!((v.state, v.phase), (EngineState::Paused, Phase::Focus));
    assert_eq!(v.session_id, started.session_id, "no second start");
    // Two threads, one Start and one press: exactly one session is started.
    let r = Arc::new(rig());
    let press = {
        let r = Arc::clone(&r);
        std::thread::spawn(move || press(&r))
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
    press(&r);
    let first = flag(&r.host).expect("set by the first press");
    r.host.set_now(T0 + 5 * MINUTE);
    press(&r);
    assert_eq!(flag(&r.host), Some(first), "never rewritten");
    // A rig that never pressed has no flag.
    let other = rig();
    assert_eq!(flag(&other.host), None);
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
