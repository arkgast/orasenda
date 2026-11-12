//! The cadence's notifications: break start, break end, the two-minute warning.

use super::*;

const END: &str = "Focus session complete.";

fn posted(host: &TestHost) -> Vec<(String, String)> {
    host.log()
        .take()
        .into_iter()
        .filter_map(|e| match e {
            Event::Posted(title, body) => Some((title, body)),
            _ => None,
        })
        .collect()
}

fn pair(title: &str, body: &str) -> (String, String) {
    (title.to_owned(), body.to_owned())
}

fn two_minutes_on(host: &TestHost) {
    let mut service = lock(&host.0.service);
    let settings = crate::api::Settings {
        notify_session_end: true,
        notify_two_minutes: true,
        ..service.settings()
    };
    service.set_settings(settings, T0).expect("saves");
}

#[test]
fn notify_break_start_body_long() {
    let host = launched(NotificationStatus::Granted);
    let mut at = T0;
    for round in 1..=4_u64 {
        host.set_now(at);
        run_action_on(&host, start()).expect("starts");
        host.set_now(at + CLASSIC_MS);
        iterate(&host);
        let body = if round == 4 {
            "Time for a long break."
        } else {
            "Time for a break."
        };
        assert_eq!(posted(&host), vec![pair(END, body)], "round {round}");
        let break_ms = if round == 4 { 15 } else { 5 } * MINUTE;
        at += CLASSIC_MS + break_ms;
        host.set_now(at);
        iterate(&host);
        assert_eq!(
            posted(&host),
            vec![pair("Break over.", "Start focus when you're ready.")],
            "round {round}"
        );
    }
}

#[test]
fn notify_two_minutes_gated_by_setting_status_and_active() {
    let warn_at = T0 + 23 * MINUTE;
    let run = |host: &TestHost| {
        run_action_on(host, start()).expect("starts");
        host.set_now(warn_at);
        iterate(host);
        posted(host)
    };

    let on = launched(NotificationStatus::Granted);
    two_minutes_on(&on);
    assert_eq!(
        run(&on),
        vec![pair("Two minutes left.", "Finish the thought.")]
    );

    let off = launched(NotificationStatus::Granted);
    assert!(run(&off).is_empty(), "the setting is off by default");

    let denied = launched(NotificationStatus::Denied);
    two_minutes_on(&denied);
    assert!(run(&denied).is_empty());

    let active = launched(NotificationStatus::Granted);
    two_minutes_on(&active);
    active.set_active(true);
    assert!(run(&active).is_empty(), "Orasenda is the active app");

    // A break says its own line.
    let in_break = launched(NotificationStatus::Granted);
    two_minutes_on(&in_break);
    run_action_on(&in_break, start()).expect("starts");
    in_break.set_now(T0 + CLASSIC_MS);
    iterate(&in_break);
    in_break.log().take();
    in_break.set_now(T0 + CLASSIC_MS + 3 * MINUTE);
    iterate(&in_break);
    assert_eq!(
        posted(&in_break),
        vec![pair("Two minutes left.", "Your break ends soon.")]
    );
}

#[test]
fn one_notification_per_advance() {
    let host = launched(NotificationStatus::Granted);
    two_minutes_on(&host);
    run_action_on(&host, start()).expect("starts");
    host.log().take();
    // Asleep across the warning, the focus end and the break end: one line, the latest state.
    host.set_now(T0 + CLASSIC_END_MS);
    iterate(&host);
    assert_eq!(
        posted(&host),
        vec![pair("Break over.", "Start focus when you're ready.")]
    );
}

#[test]
fn skipping_and_taking_a_break_do_not_notify() {
    let host = launched(NotificationStatus::Granted);
    run_action_on(&host, start()).expect("starts");
    host.set_now(T0 + 10 * MINUTE);
    run_action_on(&host, Action::TakeBreak).expect("takes a break");
    run_action_on(&host, Action::Stop).expect("skips");
    assert!(posted(&host).is_empty());
}

#[test]
fn notify_quick_completed_body() {
    let host = launched(NotificationStatus::Granted);
    run_action_on(&host, start_quick()).expect("starts");
    host.log().take();
    host.set_now(T0 + 2 * MINUTE + 1);
    iterate(&host);
    assert_eq!(
        posted(&host),
        vec![pair("Focus session complete.", "Keep going if you like.")]
    );
}
