//! The capture panel's spec and its open and close steps, against the recording fake.

use super::*;
use crate::windows::capture::{
    CAPTURE, HEIGHT, SAVED, WIDTH, announce_saved_on, capture_window_spec, close_capture_on,
    open_capture_on, saved_then_announced,
};

fn fake() -> Fake {
    Fake::new(vec![screen("a", 1440, 900)])
}

#[test]
fn capture_window_matches_the_panel_width_token() {
    assert_eq!(WIDTH, token_px("panel-width"));
    let spec = capture_window_spec();
    assert_eq!(spec.label, "capture");
    assert_eq!(spec.page, "capture.html");
    assert_eq!(
        (spec.width, spec.height),
        (f64::from(WIDTH), f64::from(HEIGHT))
    );
    assert!(!spec.visible, "shown once it is placed");
    assert!(!spec.decorations && !spec.resizable && spec.skip_taskbar);
}

#[test]
fn capture_open_creates_places_shows_and_keys_in_order() {
    let ops = fake();
    open_capture_on(&ops).unwrap();
    assert_eq!(
        ops.calls(),
        [
            "create capture".to_owned(),
            "make_capture capture".to_owned(),
            format!("place_at_pointer capture {WIDTH}x{HEIGHT}"),
            "show capture".to_owned(),
            "key capture".to_owned(),
            "capture_focus".to_owned(),
        ]
    );
    // It never activates Orasenda: `focus` is the activating call, and `main` is left alone.
    assert_eq!(ops.count("focus "), 0);
    assert_eq!(ops.count("hide_main"), 0);
}

#[test]
fn capture_open_twice_focuses() {
    let ops = fake();
    open_capture_on(&ops).unwrap();
    open_capture_on(&ops).unwrap();
    assert_eq!(ops.count("create"), 1, "one window");
    assert_eq!(ops.count("make_capture"), 1);
    assert_eq!(ops.count("key capture"), 2, "keyed again");
    assert_eq!(
        ops.count("capture_focus"),
        2,
        "the page is asked to focus its text"
    );
    assert_eq!(
        ops.count("place_at_pointer"),
        1,
        "a second open never moves the panel"
    );
    assert_eq!(ops.count("close"), 0, "the open text is never discarded");
}

#[test]
fn capture_open_losing_a_race_focuses_the_other_window() {
    let ops = fake();
    ops.windows.borrow_mut().push(CAPTURE.into());
    ops.blind.set(1);
    open_capture_on(&ops).unwrap();
    assert_eq!(ops.count("key capture"), 1);
    assert_eq!(ops.count("close"), 0);
}

#[test]
fn capture_open_failure_closes_the_window_and_says_so() {
    for failing in ["make_capture", "place_at_pointer", "show", "key"] {
        let mut ops = fake();
        ops.fail_on = Some(failing);
        let error = open_capture_on(&ops).unwrap_err();
        assert_eq!(error.kind, FocusViewErrorKind::Unavailable, "{failing}");
        assert!(
            !ops.exists(CAPTURE),
            "{failing}: no half-built window stays"
        );
        assert_eq!(ops.count("capture_focus"), 0, "{failing}");
    }
    let mut ops = fake();
    ops.fail_on = Some("create");
    assert!(open_capture_on(&ops).is_err());
}

#[test]
fn capture_close_closes_only_an_open_panel() {
    let ops = fake();
    close_capture_on(&ops);
    assert_eq!(ops.count("close"), 0);
    open_capture_on(&ops).unwrap();
    close_capture_on(&ops);
    assert_eq!(ops.count("close capture"), 1);
    assert!(!ops.exists(CAPTURE));
}

#[test]
fn capture_note_announces_only_when_the_save_succeeded() {
    let ops = fake();
    let failed: Result<(), &str> = Err("store");
    assert_eq!(saved_then_announced(&ops, failed), Err("store"));
    assert_eq!(ops.count("announce"), 0, "a failed save says nothing");
    assert_eq!(saved_then_announced(&ops, Ok::<_, &str>(7)), Ok(7));
    assert_eq!(ops.calls(), ["announce Saved to Inbox.".to_owned()]);
}

#[test]
fn capture_saved_is_announced_once_and_a_failure_is_not_an_error() {
    let ops = fake();
    announce_saved_on(&ops);
    assert_eq!(SAVED, "Saved to Inbox.");
    assert_eq!(ops.calls(), ["announce Saved to Inbox.".to_owned()]);
    let mut failing = fake();
    failing.fail_on = Some("announce");
    announce_saved_on(&failing);
    assert_eq!(failing.count("announce"), 1);
}
