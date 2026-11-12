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

#[test]
fn a_floater_whose_display_cannot_be_read_is_placed() {
    let mut fake = Fake::new(vec![screen("A", 1440, 900)]);
    fake.windows.borrow_mut().push(FLOATER.into());
    fake.on = None;
    fake.main = Some("A".into());
    reframe_on(&fake);
    assert_eq!(fake.count("place floater A"), 1, "{:?}", fake.calls());
}

#[test]
fn refreshes_do_not_interleave() {
    use std::sync::{Arc, Mutex};
    let lock = Arc::new(Mutex::new(()));
    let log = Arc::new(Mutex::new(Vec::new()));
    let threads: Vec<_> = (0..4)
        .map(|n| {
            let (lock, log) = (lock.clone(), log.clone());
            std::thread::spawn(move || {
                crate::windows::displays::serialized(&lock, || {
                    log.lock().unwrap().push(format!("start {n}"));
                    std::thread::sleep(std::time::Duration::from_millis(5));
                    log.lock().unwrap().push(format!("end {n}"));
                });
            })
        })
        .collect();
    for t in threads {
        t.join().unwrap();
    }
    let log = log.lock().unwrap();
    for pair in log.chunks(2) {
        assert_eq!(pair[0].replace("start", "end"), pair[1], "{log:?}");
    }
}

#[test]
fn display_infos_flag_the_main_display_first_fallback() {
    use crate::commands::display_infos;
    let mut ops = Fake::new(vec![screen("1", 1440, 900), screen("2", 1920, 1080)]);
    ops.main = Some("2".into());
    let infos = display_infos(&ops);
    assert_eq!(
        infos.iter().map(|d| d.has_main_window).collect::<Vec<_>>(),
        vec![true, false]
    );
    assert_eq!(
        infos.iter().map(|d| d.id.as_str()).collect::<Vec<_>>(),
        vec!["2", "1"],
        "the main window's display first, the rest in screen order"
    );
    ops.main = Some("gone".into());
    assert_eq!(
        display_infos(&ops)
            .iter()
            .map(|d| d.has_main_window)
            .collect::<Vec<_>>(),
        vec![true, false]
    );
    assert_eq!(focus::focus_label("1"), "focus-1");
}
