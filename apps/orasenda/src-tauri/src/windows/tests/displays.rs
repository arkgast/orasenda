//! Display changes: the Focus windows follow the displays, the floater leaves a gone one.

use super::*;
use crate::windows::displays::reframe_on;

fn calls_of(fake: &Fake) -> Vec<String> {
    fake.calls()
}

#[test]
fn screens_changed_reframes_each_focus_window_and_emits_insets() {
    let fake = Fake::new(vec![screen("A", 1440, 900), screen("B", 1920, 1080)]);
    fake.windows
        .borrow_mut()
        .extend(["main".into(), "focus-A".into(), "focus-B".into()]);
    reframe_on(&fake);
    assert_eq!(
        calls_of(&fake),
        [
            "cover focus-A A",
            "insets focus-A",
            "cover focus-B B",
            "insets focus-B"
        ]
    );
    assert_eq!(fake.count("key"), 0, "no window takes key focus");
    assert_eq!(fake.count("show"), 0);
}

#[test]
fn screens_changed_closes_focus_on_gone_display() {
    let fake = Fake::new(vec![screen("A", 1440, 900)]);
    fake.windows
        .borrow_mut()
        .extend(["focus-A".into(), "focus-B".into()]);
    reframe_on(&fake);
    assert_eq!(
        calls_of(&fake),
        ["cover focus-A A", "insets focus-A", "close focus-B"]
    );
    assert_eq!(*fake.windows.borrow(), ["focus-A"]);
}

#[test]
fn screens_changed_closes_a_focus_window_that_cannot_be_framed() {
    let mut fake = Fake::new(vec![screen("A", 1440, 900)]);
    fake.fail_on = Some("cover");
    fake.windows.borrow_mut().push("focus-A".into());
    reframe_on(&fake);
    assert_eq!(calls_of(&fake), ["cover focus-A A", "close focus-A"]);
}

#[test]
fn screens_changed_moves_floater_to_main_display() {
    let mut fake = Fake::new(vec![screen("A", 1440, 900)]);
    fake.windows.borrow_mut().push(FLOATER.into());
    fake.on = Some("B".into());
    fake.main = Some("A".into());
    reframe_on(&fake);
    let expected = format!("place floater A {}", {
        let f = orasenda_service::windows::default_frame(
            fake.screens[0].visible,
            (floater::WIDTH, floater::HEIGHT),
            floater::EDGE_INSET,
        );
        format!("{},{},{},{}", f.x, f.y, f.width, f.height)
    });
    assert!(calls_of(&fake).contains(&expected), "{:?}", calls_of(&fake));
    assert_eq!(fake.count("key"), 0, "it moves, it doesn't take key focus");
    assert_eq!(fake.count("show"), 0);
}

#[test]
fn screens_changed_uses_the_stored_frame_on_the_main_display() {
    let mut fake = Fake::new(vec![screen("A", 1440, 900)]);
    fake.windows.borrow_mut().push(FLOATER.into());
    fake.on = Some("B".into());
    fake.main = Some("A".into());
    fake.stored = Some(("A".into(), rect(100, 200, 280, 64)));
    reframe_on(&fake);
    assert!(
        calls_of(&fake).contains(&"place floater A 100,200,280,64".to_string()),
        "{:?}",
        calls_of(&fake)
    );
}

#[test]
fn screens_changed_leaves_a_floater_on_a_connected_display() {
    let mut fake = Fake::new(vec![screen("A", 1440, 900), screen("B", 1920, 1080)]);
    fake.windows.borrow_mut().push(FLOATER.into());
    fake.on = Some("B".into());
    reframe_on(&fake);
    assert_eq!(fake.count("place"), 0);
}
