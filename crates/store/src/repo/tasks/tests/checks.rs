use super::*;

fn refused(task: &NewTask) -> bool {
    store().write(1_000, |txn| insert(txn, task)).is_err()
}

#[test]
fn checks_refuse_bad_values() {
    let ok = new_task("t", Lane::Backlog, "V");
    assert!(!refused(&ok));
    let mut t = ok.clone();
    t.title = String::new();
    assert!(refused(&t), "empty title");
    t.title = "x".repeat(200);
    assert!(!refused(&t), "200 characters");
    t.title = "x".repeat(201);
    assert!(refused(&t), "201 characters");
    let mut t = ok.clone();
    t.estimate = Some(17);
    assert!(refused(&t), "estimate 17");
    t.estimate = Some(0);
    assert!(refused(&t), "estimate 0");
    t.estimate = Some(16);
    assert!(!refused(&t), "estimate 16");
    let mut t = ok.clone();
    t.due = Some("tomorrow".into());
    assert!(refused(&t), "due");
    let mut t = ok.clone();
    t.tags = (0..9).map(|n| format!("t{n}")).collect();
    assert!(refused(&t), "nine tags");
}

#[test]
fn rank_holds_only_alphanumerics_and_is_not_empty() {
    for bad in ["", "a b", "a-b", "é", "a\n"] {
        assert!(refused(&new_task("t", Lane::Backlog, bad)), "{bad:?}");
    }
    for good in ["0", "Az9", "V"] {
        assert!(!refused(&new_task("t", Lane::Backlog, good)), "{good:?}");
    }
}

#[test]
fn a_bad_lane_and_bad_json_are_refused_by_sql() {
    let store = store();
    let run = |sql: &str| store.write(1_000, |txn| Ok(txn.conn().execute_batch(sql)?));
    let head = "INSERT INTO task (id, title, lane, rank, created_at, updated_at)";
    assert!(run(&format!("{head} VALUES ('a', 't', 'backlog', 'V', 1, 1)")).is_ok());
    assert!(run(&format!("{head} VALUES ('b', 't', 'someday', 'V', 1, 1)")).is_err());
    assert!(run("UPDATE task SET tags = 'not json'").is_err());
    assert!(run("UPDATE task SET checklist = '{}'").is_err());
    assert!(run("UPDATE task SET breakdown_dismissed = 2").is_err());
}
