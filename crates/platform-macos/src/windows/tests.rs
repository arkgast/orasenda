//! Pure logic and the main-thread refusals of the `windows` module. Null-pointer refusals
//! need the main thread, so they run in `tests/windows_main_thread.rs` (no harness).

use std::ptr::null_mut;

use super::display_uuid::{choose_keys, legacy_raw};
use super::displays::{Display, Rect, display_key, to_appkit, to_top_left};
use super::keys::{FloaterKey, Modifiers, floater_key};
use super::*;

const PRIMARY_HEIGHT: f64 = 900.0;

fn rect(x: f64, y: f64, width: f64, height: f64) -> Rect {
    Rect {
        x,
        y,
        width,
        height,
    }
}

#[test]
fn to_top_left_round_trips_two_displays() {
    // AppKit, bottom-left origin at the primary's bottom-left: a display above the primary
    // (y above its top edge) and one to the left (negative x).
    let primary = rect(0.0, 0.0, 1440.0, PRIMARY_HEIGHT);
    let above = rect(0.0, PRIMARY_HEIGHT, 1920.0, 1080.0);
    let left = rect(-1280.0, 100.0, 1280.0, 720.0);

    assert_eq!(
        to_top_left(primary, PRIMARY_HEIGHT),
        rect(0.0, 0.0, 1440.0, 900.0)
    );
    assert_eq!(
        to_top_left(above, PRIMARY_HEIGHT),
        rect(0.0, -1080.0, 1920.0, 1080.0)
    );
    assert_eq!(
        to_top_left(left, PRIMARY_HEIGHT),
        rect(-1280.0, 80.0, 1280.0, 720.0)
    );
    for frame in [primary, above, left] {
        assert_eq!(
            to_appkit(to_top_left(frame, PRIMARY_HEIGHT), PRIMARY_HEIGHT),
            frame
        );
    }
}

#[test]
fn display_key_is_label_safe() {
    for raw in [
        "69733248-Built-in Retina Display",
        "1-LG UltraFine (5K) \u{2014} left",
        "",
        "../../etc",
        "focus window",
    ] {
        let key = display_key(raw);
        assert!(!key.is_empty(), "{raw:?}");
        assert!(
            key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'),
            "{raw:?} -> {key:?}"
        );
    }
    // A clean id is kept as it is, and the fallback id keeps two same-named monitors apart.
    assert_eq!(display_key("A1-b2"), "A1-b2");
    assert_ne!(display_key("1-DELL U2723QE"), display_key("2-DELL U2723QE"));
}

#[test]
fn display_key_from_uuid_is_label_safe() {
    let uuid = "37D8832A-2D66-02CA-B9F7-8F30A301B230";
    let key = display_key(uuid);
    assert_eq!(
        key, uuid,
        "a UUID is already label-safe and is kept as it is"
    );
    assert!(key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
    // The legacy form stays as it was, and is never the UUID.
    assert_eq!(
        display_key(&legacy_raw(Some(69_733_248), 0, "Built-in Retina Display")),
        "69733248-Built-in-Retina-Display"
    );
    assert_eq!(display_key(&legacy_raw(None, 2, "X")), "i2-X");
}

#[test]
fn relative_frames_survive_a_round_trip_on_the_second_display() {
    let second = Display {
        id: "2".into(),
        legacy_id: "2".into(),
        name: "Second".into(),
        frame: rect(-1280.0, 80.0, 1280.0, 720.0),
        visible: rect(-1280.0, 104.0, 1280.0, 696.0),
    };
    let global = rect(-1000.4, 200.6, 320.0, 180.0);
    let relative = displays::to_relative(&second, global);
    assert_eq!(relative, rect(280.0, 121.0, 320.0, 180.0));
    assert_eq!(
        displays::from_relative(&second, relative),
        rect(-1000.0, 201.0, 320.0, 180.0)
    );
}

#[test]
fn display_containing_picks_the_display_under_the_window_centre() {
    let a = Display {
        id: "a".into(),
        legacy_id: "a".into(),
        name: "A".into(),
        frame: rect(0.0, 0.0, 100.0, 100.0),
        visible: rect(0.0, 0.0, 100.0, 100.0),
    };
    let b = Display {
        id: "b".into(),
        legacy_id: "b".into(),
        name: "B".into(),
        frame: rect(100.0, 0.0, 100.0, 100.0),
        visible: rect(100.0, 0.0, 100.0, 100.0),
    };
    let all = [a, b];
    assert_eq!(
        displays::display_containing(&all, rect(90.0, 10.0, 40.0, 10.0)).map(|d| d.id.as_str()),
        Some("b")
    );
    assert_eq!(
        displays::display_containing(&all, rect(500.0, 10.0, 10.0, 10.0)),
        None
    );
}

#[test]
fn floater_key_maps_six_keys_only() {
    let none = Modifiers::default();
    let command = Modifiers {
        command: true,
        ..none
    };
    let shift_command = Modifiers {
        shift: true,
        command: true,
        ..none
    };

    assert_eq!(floater_key(49, none), Some(FloaterKey::Space));
    assert_eq!(floater_key(36, none), Some(FloaterKey::Return));
    assert_eq!(floater_key(53, none), Some(FloaterKey::Escape));
    assert_eq!(floater_key(3, shift_command), Some(FloaterKey::FullScreen));
    assert_eq!(
        floater_key(17, shift_command),
        Some(FloaterKey::FloatingTimer)
    );
    assert_eq!(floater_key(40, command), Some(FloaterKey::Commands));

    // Any other modifier set, and any other key, is not ours.
    assert_eq!(floater_key(49, command), None);
    assert_eq!(
        floater_key(
            53,
            Modifiers {
                shift: true,
                ..none
            }
        ),
        None
    );
    assert_eq!(floater_key(3, command), None);
    assert_eq!(
        floater_key(
            3,
            Modifiers {
                option: true,
                ..shift_command
            }
        ),
        None
    );
    assert_eq!(
        floater_key(
            17,
            Modifiers {
                control: true,
                ..shift_command
            }
        ),
        None
    );
    assert_eq!(floater_key(40, shift_command), None);
    assert_eq!(
        floater_key(
            40,
            Modifiers {
                option: true,
                ..command
            }
        ),
        None
    );
    assert_eq!(floater_key(0, none), None);
}

#[test]
fn windows_fns_refuse_off_main_thread() {
    let refused = Err(WindowError::NotOnMainThread);
    // SAFETY: null is allowed by the contract; the main-thread check runs first.
    unsafe {
        assert_eq!(configure_floater(null_mut()), refused);
        assert_eq!(key_without_activation(null_mut()), refused);
        assert_eq!(
            set_frame(null_mut(), "x", rect(0.0, 0.0, 1.0, 1.0)),
            refused
        );
        assert_eq!(frame_of(null_mut()), None);
        assert!(matches!(
            install_floater_key_monitor(null_mut(), Box::new(|_| false)),
            Err(WindowError::NotOnMainThread)
        ));
    }
    assert_eq!(
        displays().map(|d| d.len()),
        Err(WindowError::NotOnMainThread)
    );
    assert!(matches!(
        // SAFETY: null is refused after the main-thread check, never dereferenced.
        unsafe { observe_full_screen(null_mut(), Box::new(|_| {})) },
        Err(WindowError::NotOnMainThread)
    ));
    assert!(matches!(
        observe_screen_changes(Box::new(|| {})),
        Err(WindowError::NotOnMainThread)
    ));
}

#[test]
fn choose_keys_prefers_the_uuid() {
    let keys = choose_keys(Some("U-1".into()), Some(7), 0, "Dell");
    assert_eq!(keys, ("U-1".to_owned(), "7-Dell".to_owned()));
}

#[test]
fn choose_keys_falls_back_to_the_legacy_key() {
    let keys = choose_keys(None, Some(7), 0, "Dell");
    assert_eq!(keys, ("7-Dell".to_owned(), "7-Dell".to_owned()));
    let no_number = choose_keys(None, None, 2, "Dell");
    assert_eq!(no_number, ("i2-Dell".to_owned(), "i2-Dell".to_owned()));
}
