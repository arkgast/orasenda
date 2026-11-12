//! The menu bar for the cadence: glyph, label, header and items per state.

use orasenda_core::{BreakKind, Phase};

use super::*;
use crate::ipc::Offer;
use crate::runtime::session::Action;

const TWO_MIN: u64 = 120_000;

fn menu(view: &TimerView) -> Vec<String> {
    let entries = menu_items(view, &NextSession::default(), &FocusItems::default(), false);
    entries
        .iter()
        .take_while(|entry| !matches!(entry, MenuEntry::Item { label, .. } if label == SHOW))
        .map(|entry| match entry {
            MenuEntry::Item { label, .. } => label.clone(),
            MenuEntry::Header => "<header>".into(),
            MenuEntry::Separator => "—".into(),
            MenuEntry::Submenu { label, .. } => format!("{label} ▸"),
        })
        .collect()
}

fn with_finish(view: TimerView, finish: &str) -> TimerView {
    TimerView {
        finish: Some(finish.into()),
        ..view
    }
}

fn warning(can_extend: bool) -> TimerView {
    with_finish(
        TimerView {
            mode: Mode::Warning,
            can_extend,
            ..running(TWO_MIN)
        },
        "14:25",
    )
}

fn on_break(kind: BreakKind, can_extend: bool) -> TimerView {
    with_finish(
        TimerView {
            mode: Mode::Break,
            phase: Phase::Break,
            break_kind: Some(kind),
            can_extend,
            ..running(4 * 60_000)
        },
        "14:30",
    )
}

fn auto_step() -> TimerView {
    with_finish(
        TimerView {
            check_in: Some("Still going · ends 15:40".into()),
            ..running(9 * 60_000)
        },
        "15:40",
    )
}

#[test]
fn tray_items_warning() {
    assert_eq!(
        menu(&warning(true)),
        [
            "<header>",
            "—",
            "Pause session",
            "Add 10 minutes",
            "End session",
            "—"
        ]
    );
    assert_eq!(
        menu(&warning(false)),
        ["<header>", "—", "Pause session", "End session", "—"]
    );
    assert_eq!(
        header_text(&warning(true)).as_deref(),
        Some("Almost up · 2 minutes left · ends 14:25")
    );
}

#[test]
fn tray_items_break_with_extend() {
    let short = on_break(BreakKind::Short, true);
    assert_eq!(
        menu(&short),
        [
            "<header>",
            "—",
            "Pause break",
            "Back to focus · 10 min",
            "Skip break",
            "—"
        ]
    );
    assert_eq!(
        header_text(&short).as_deref(),
        Some("Break · 4 minutes left · ends 14:30")
    );
    assert_eq!(
        menu(&on_break(BreakKind::Long, false)),
        ["<header>", "—", "Pause break", "Skip break", "—"]
    );
    assert_eq!(
        header_text(&on_break(BreakKind::Long, false)).as_deref(),
        Some("Long break · 4 minutes left · ends 14:30")
    );
    let paused_break = TimerView {
        state: orasenda_core::EngineState::Paused,
        mode: Mode::Paused,
        ..on_break(BreakKind::Short, false)
    };
    assert_eq!(
        menu(&paused_break),
        ["<header>", "—", "Resume break", "Skip break", "—"]
    );
}

#[test]
fn tray_items_auto_step() {
    assert_eq!(
        menu(&auto_step()),
        [
            "<header>",
            "—",
            "Pause session",
            "Take a break",
            "End session",
            "—"
        ]
    );
    assert_eq!(
        header_text(&auto_step()).as_deref(),
        Some("Focus · 9 minutes left · ends 15:40")
    );
}

#[test]
fn tray_items_keep_going_offer() {
    let offer = TimerView {
        offer: Some(Offer::KeepGoing),
        ..idle()
    };
    let items = menu(&offer);
    assert_eq!(&items[..3], ["Keep going", "Stop here", "—"]);
    assert!(items.contains(&"Start focus · 25 min".to_string()));
    assert!(!menu(&idle()).contains(&"Keep going".to_string()));
}

#[test]
fn tray_glyph_per_mode() {
    assert_eq!(tray_title_and_icon(&warning(true)).1, Glyph::Warning);
    let on_break = on_break(BreakKind::Short, false);
    assert_eq!(
        tray_title_and_icon(&on_break),
        (Some("04:00".to_string()), Glyph::Break)
    );
    assert_eq!(tray_label(&warning(true)), "Almost up, 2 minutes remaining");
    assert_eq!(tray_label(&on_break), "Break, 4 minutes remaining");
}

#[test]
fn cadence_items_run_the_service_actions() {
    for (id, action) in [
        (ADD_TEN, Action::Extend),
        (BACK_TO_FOCUS, Action::Extend),
        (TAKE_BREAK, Action::TakeBreak),
        (SKIP_BREAK, Action::Stop),
        (PAUSE_BREAK, Action::Pause),
        (RESUME_BREAK, Action::Resume),
        (STOP_HERE, Action::DismissOffer),
    ] {
        assert_eq!(menu_command(id), Some(MenuCommand::Session(action)), "{id}");
    }
    assert_eq!(menu_command(KEEP_GOING), Some(MenuCommand::Start));
}
