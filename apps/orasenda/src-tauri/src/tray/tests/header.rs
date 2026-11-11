//! Tests for the status header: its text and how often it changes.

use super::*;

fn with_finish(view: TimerView, finish: &str) -> TimerView {
    TimerView {
        finish: Some(finish.to_string()),
        ..view
    }
}

#[test]
fn header_minutes_ceil_and_singular() {
    assert_eq!(header_text(&idle()), None);
    let focus = |ms| header_text(&with_finish(running(ms), "15:20")).unwrap();
    assert_eq!(focus(18 * 60_000), "Focus · 18 minutes left · ends 15:20");
    assert_eq!(
        focus(17 * 60_000 + 1),
        "Focus · 18 minutes left · ends 15:20"
    );
    assert_eq!(focus(2 * 60_000), "Focus · 2 minutes left · ends 15:20");
    assert_eq!(focus(60_001), "Focus · 2 minutes left · ends 15:20");
    assert_eq!(focus(60_000), "Focus · 1 minute left · ends 15:20");
    assert_eq!(focus(1_000), "Focus · 1 minute left · ends 15:20");
    assert_eq!(focus(0), "Focus · 1 minute left · ends 15:20");
    assert_eq!(
        header_text(&paused(18 * 60_000)).as_deref(),
        Some("Paused · 18 minutes left")
    );
    assert_eq!(
        header_text(&with_finish(paused(60_000), "15:20")).as_deref(),
        Some("Paused · 1 minute left")
    );
}

#[test]
fn header_set_text_once_a_minute() {
    let (tray, calls) = tray_with(Recorder::default());
    let view = |ms| with_finish(running(ms), "15:20");
    tray.render(&view(180_000));
    calls.take();

    let mut header_calls = 0;
    let mut menu_calls = 0;
    // Every second of the next two minutes.
    for second in 1..=120u64 {
        tray.render(&view(180_000 - second * 1_000));
        for call in calls.take() {
            match call {
                Call::Header(_) => header_calls += 1,
                Call::Menu(..) => menu_calls += 1,
                _ => {}
            }
        }
    }
    assert_eq!(header_calls, 2, "3 -> 2 -> 1 minutes left");
    assert_eq!(menu_calls, 0, "the item list never changed");
}
