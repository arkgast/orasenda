//! The task a session is for rides the engine and lands on the focus row only.

use super::*;

fn with_task(task: &str) -> Session {
    let mut s = Session::default();
    s.start(id("a"), steady(), 1, Some(task.into()), T0)
        .unwrap();
    s
}

#[test]
fn focus_record_carries_task_id() {
    let mut s = with_task("t1");
    assert_eq!(s.task_id(), Some("t1"));
    let stopped = s.stop(T0 + 10 * MIN).unwrap();
    assert_eq!(stopped[0].task_id.as_deref(), Some("t1"));

    // Completed in full: the focus row is written with the session, after its break.
    let mut s = with_task("t2");
    s.advance(T0 + 25 * MIN, None);
    assert_eq!(s.task_id(), Some("t2"), "kept through the break");
    let rs = records(s.advance(T0 + 30 * MIN, None));
    assert_eq!(rs[0].task_id.as_deref(), Some("t2"));
}

#[test]
fn a_session_without_a_task_has_none() {
    let mut s = classic_at(T0);
    assert_eq!(s.task_id(), None);
    let rs = s.stop(T0 + MIN).unwrap();
    assert_eq!(rs[0].task_id, None);
}

#[test]
fn break_record_has_no_task() {
    let mut s = with_task("t1");
    s.advance(T0 + 25 * MIN, None);
    let rs = records(s.advance(T0 + 30 * MIN, None));
    assert_eq!(rs[1].phase, Phase::Break);
    assert_eq!(rs[1].task_id, None);
    // A break cut short by "+10 min" has none either, and the focus keeps its task.
    let mut s = with_task("t1");
    s.advance(T0 + 25 * MIN, None);
    s.extend(T0 + 27 * MIN).unwrap();
    assert_eq!(s.task_id(), Some("t1"));
    let rs = s.stop(T0 + 28 * MIN).unwrap();
    assert_eq!(rs[0].task_id.as_deref(), Some("t1"));
    assert!(rs[1..].iter().all(|r| r.task_id.is_none()));
}

#[test]
fn set_task_in_focus_and_pause_reports_a_change() {
    let mut s = classic_at(T0);
    assert_eq!(s.set_task(Some("t1".into()), T0 + MIN), Ok(true));
    assert_eq!(s.set_task(Some("t1".into()), T0 + MIN), Ok(false));
    s.pause(T0 + 2 * MIN).unwrap();
    assert_eq!(s.set_task(Some("t2".into()), T0 + 3 * MIN), Ok(true));
    assert_eq!(s.set_task(None, T0 + 3 * MIN), Ok(true));
    assert_eq!(s.set_task(None, T0 + 3 * MIN), Ok(false));
    assert_eq!(s.task_id(), None);
    assert_eq!(
        Session::Idle.set_task(None, T0),
        Err(TimerError::NothingRunning)
    );
}

#[test]
fn set_task_during_break_changes_open_focus() {
    let mut s = with_task("t1");
    s.advance(T0 + 25 * MIN, None);
    assert_eq!(s.set_task(Some("t2".into()), T0 + 26 * MIN), Ok(true));
    assert_eq!(
        s.open_focus().and_then(|f| f.task_id.as_deref()),
        Some("t2")
    );
    assert_eq!(s.task_id(), Some("t2"));
    let rs = records(s.advance(T0 + 30 * MIN, None));
    assert_eq!(rs[0].task_id.as_deref(), Some("t2"));
    assert_eq!(rs[1].task_id, None);
}

#[test]
fn v7_snapshot_loads_without_task_id() {
    let mut s = with_task("t1");
    s.advance(T0 + 25 * MIN, None);
    let mut j = serde_json::to_value(&s).unwrap();
    assert_eq!(j["open_focus"]["task_id"], "t1");
    // A snapshot written before task_id existed.
    j.as_object_mut().unwrap().remove("task_id");
    j["open_focus"].as_object_mut().unwrap().remove("task_id");
    let back: Session = serde_json::from_value(j).unwrap();
    assert_eq!(back.task_id(), None);
    assert_eq!(back.open_focus().map(|f| f.task_id.clone()), Some(None));

    let focus = serde_json::to_value(classic_at(T0)).unwrap();
    let mut j = focus;
    j.as_object_mut().unwrap().remove("task_id");
    let back: Session = serde_json::from_value(j).unwrap();
    assert_eq!(back, classic_at(T0));
    // And a snapshot with the task round-trips.
    let s = with_task("t9");
    let text = serde_json::to_string(&s).unwrap();
    assert_eq!(serde_json::from_str::<Session>(&text).unwrap(), s);
}

#[test]
fn auto_step_and_quick_roll_on_keep_task() {
    let limit = Some(60 * MIN);
    let mut s = with_task("t1");
    s.advance(T0 + 25 * MIN, limit);
    assert_eq!(s.task_id(), Some("t1"));
    let rs = records(s.advance(T0 + 60 * MIN, limit));
    assert_eq!(rs[0].task_id.as_deref(), Some("t1"));

    let mut q = Session::Idle;
    q.start(id("q"), SessionPreset::Quick, 1, Some("t1".into()), T0)
        .unwrap();
    let ms = q.advance(T0 + QUICK_START_MS, limit);
    assert_eq!(ms.len(), 2);
    match &ms[0] {
        Milestone::Ended(rs) => assert_eq!(rs[0].task_id.as_deref(), Some("t1")),
        other => panic!("expected Ended, got {other:?}"),
    }
    assert_eq!(ms[1], Milestone::RollOn);
}
