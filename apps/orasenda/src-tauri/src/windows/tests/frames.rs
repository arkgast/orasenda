//! The frame save debounce and which windows may be closed from the webview.

use super::*;

#[test]
fn frame_debounce_trailing_500ms() {
    let mut trailing = Trailing::default();
    assert_eq!(
        trailing.touch(1_000),
        Some(1_000 + DEBOUNCE_MS),
        "the first move arms one wake-up"
    );
    for at in [1_050, 1_200, 1_499] {
        assert_eq!(
            trailing.touch(at),
            None,
            "moves inside the window schedule nothing"
        );
        assert!(!trailing.due(at));
    }
    assert!(!trailing.due(1_499));
    assert!(trailing.due(1_500), "one save, 500 ms after the first move");
    assert!(!trailing.due(1_501), "and only one");
    assert_eq!(
        trailing.touch(1_600),
        Some(2_100),
        "the next burst arms again"
    );
}

#[test]
fn floater_close_drops_the_pending_trailing_save() {
    let mut trailing = Trailing::default();
    trailing.touch(0);
    trailing.cancel();
    assert!(
        !trailing.due(10_000),
        "the pending trailing save is dropped"
    );
}

#[test]
fn focus_view_close_refused_for_main() {
    use crate::commands::closable;
    assert_eq!(
        closable("main").unwrap_err().kind,
        FocusViewErrorKind::Unavailable
    );
    assert!(closable("floater").is_ok());
    assert!(closable("focus-1").is_ok());
}
